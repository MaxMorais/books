import { createServer, IncomingMessage, ServerResponse } from 'http';
import Bree from 'bree';
import { createReadStream, createWriteStream } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { getLanguageMap } from 'main/getLanguageMap';
import { getTemplates } from 'main/getPrintTemplates';
import { sendAPIRequest } from 'main/api';
import { DatabaseMethod } from 'utils/db/types';
import { ConfigFile } from 'fyo/core/types';

const root = path.resolve(__dirname, '..');
const webRoot = path.join(root, 'dist_web');
const host = '127.0.0.1';
const port = Number(process.env.BOOKS_WEB_PORT ?? 8080);
const uploadsRoot = path.join(os.homedir(), '.frappe-books-web', 'uploads');
const configPath = path.join(os.homedir(), '.frappe-books-web', 'config.json');
let databaseManagerPromise:
  | Promise<typeof import('backend/database/manager').default>
  | undefined;
let scheduler: Bree | undefined;

process.resourcesPath ??= path.join(root, 'build');

const contentTypes: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function getDatabaseManager() {
  databaseManagerPromise ??= import('backend/database/manager').then(
    ({ default: databaseManager }) => databaseManager
  );
  return databaseManagerPromise;
}

async function getErrorHandledResponse(
  func: () => Promise<unknown> | unknown
) {
  try {
    return { data: await func() };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    return {
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
        code: err.code,
      },
    };
  }
}

async function initScheduler(interval: string) {
  if (scheduler) {
    await scheduler.stop();
  }

  scheduler = new Bree({
    root: path.join(root, 'jobs'),
    defaultExtension: 'ts',
    jobs: [
      {
        name: 'triggerErpNextSync',
        interval,
        worker: { workerData: { useTsNode: true } },
      },
      {
        name: 'checkLoyaltyProgramExpiry',
        interval: '24 hours',
        worker: { workerData: { useTsNode: true } },
      },
    ],
    worker: { argv: ['--require', 'ts-node/register'] },
  });
  await scheduler.start();
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) {
      throw new Error('Request body exceeds 1 MiB.');
    }
    chunks.push(buffer);
  }

  async function uploadFile(request: IncomingMessage) {
    const contentLength = Number(request.headers['content-length'] ?? 0);
    if (!Number.isFinite(contentLength) || contentLength > 1024 * 1024 * 1024) {
      throw new Error('Uploads must be 1 GiB or smaller.');
    }

    const encodedName = request.headers['x-file-name'];
    if (typeof encodedName !== 'string') {
      throw new Error('Missing uploaded file name.');
    }

    const filename = path.basename(decodeURIComponent(encodedName));
    if (!filename || filename === '.') {
      throw new Error('Invalid uploaded file name.');
    }

    await fs.mkdir(uploadsRoot, { recursive: true });
    const filePath = path.join(uploadsRoot, `${Date.now()}-${filename}`);
    await pipeline(request, createWriteStream(filePath, { flags: 'wx' }));
    return filePath;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as {
    action: string;
    args?: unknown[];
  };
}

async function getDefaultDatabasePath(companyName: string) {
  const databaseRoot = path.join(os.homedir(), 'Documents', 'Frappe Books');
  await fs.mkdir(path.join(databaseRoot, 'backups'), { recursive: true });
  const basePath = path.join(databaseRoot, `${companyName}.books.db`);
  try {
    await fs.access(basePath);
  } catch {
    return basePath;
  }

  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '');
  return path.join(databaseRoot, `${companyName}_${timestamp}.books.db`);
}

async function getConfigFiles(): Promise<ConfigFile[]> {
  try {
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8')) as {
      files?: ConfigFile[];
    };
    return config.files ?? [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function setConfigFiles(files: ConfigFile[]) {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ files }, null, 2), 'utf-8');
}

async function getConfigFilesWithModified() {
  const configFiles = await getConfigFiles();
  const files = await Promise.all(
    configFiles.map(async (file) => {
      try {
        const { mtime } = await fs.stat(file.dbPath);
        return { ...file, modified: mtime.toISOString() };
      } catch {
        return undefined;
      }
    })
  );
  return files.filter(
    (file): file is ConfigFile & { modified: string } => file !== undefined
  );
}

function normalizeDatabaseArgs(method: DatabaseMethod, args: unknown[]) {
  const normalized = [...args];
  switch (method) {
    case 'get':
      if (normalized[2] === null) {
        normalized[2] = undefined;
      }
      break;
    case 'getAll':
      if (normalized[1] === null) {
        normalized[1] = undefined;
      }
      break;
    case 'exists':
      if (normalized[1] === null) {
        normalized[1] = undefined;
      }
      break;
  }
  return normalized;
}

async function dispatch(action: string, args: unknown[]) {
  switch (action) {
    case 'check-db-access':
      return await fs
        .access(args[0] as string)
        .then(() => true)
        .catch(() => false);
    case 'get-db-default-path':
      return await getDefaultDatabasePath(args[0] as string);
    case 'get-language-map':
      try {
        return {
          languageMap: await getLanguageMap(args[0] as string),
          success: true,
          message: '',
        };
      } catch (error) {
        return {
          languageMap: {},
          success: false,
          message: (error as Error).message,
        };
      }
    case 'get-templates':
      return await getTemplates(args[0] as number | undefined);
    case 'init-scheduler':
      return await initScheduler(args[0] as string);
    case 'send-api-request':
      return await sendAPIRequest(
        args[0] as string,
        args[1] as import('node-fetch').RequestInit
      );
    case 'get-creds':
      return { errorLogUrl: '', tokenString: '', telemetryUrl: '' };
    case 'get-db-list':
      return await getConfigFilesWithModified();
    case 'set-files':
      await setConfigFiles(args[0] as ConfigFile[]);
      return;
    case 'delete-file':
      return await getErrorHandledResponse(() => fs.unlink(args[0] as string));
    case 'get-env': {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(root, 'package.json'), 'utf-8')
      ) as { version: string };
      return {
        isDevelopment: process.env.NODE_ENV === 'development',
        platform: process.platform,
        version: packageJson.version,
      };
    }
    case 'db-schema':
      return await getErrorHandledResponse(async () =>
        (await getDatabaseManager()).getSchemaMap()
      );
    case 'db-create':
      return await getErrorHandledResponse(async () =>
        (await getDatabaseManager()).createNewDatabase(
          args[0] as string,
          args[1] as string
        )
      );
    case 'db-connect':
      return await getErrorHandledResponse(async () =>
        (await getDatabaseManager()).connectToDatabase(
          args[0] as string,
          args[1] as string
        )
      );
    case 'db-call':
      return await getErrorHandledResponse(async () =>
        (await getDatabaseManager()).call(
          args[0] as DatabaseMethod,
          ...normalizeDatabaseArgs(args[0] as DatabaseMethod, args.slice(1))
        )
      );
    case 'db-bespoke':
      return await getErrorHandledResponse(async () =>
        (await getDatabaseManager()).callBespoke(
          args[0] as string,
          ...args.slice(1)
        )
      );
    default:
      throw new Error(`Unsupported web action: ${action}`);
  }
}

function sendJson(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
}

async function serveStatic(pathname: string, response: ServerResponse) {
  const requestedPath =
    pathname === '/' || !path.extname(pathname)
      ? 'index.html'
      : pathname.slice(1);
  const filePath = path.resolve(webRoot, requestedPath);
  if (!filePath.startsWith(`${webRoot}${path.sep}`)) {
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error('Not a file');
    }

    response.writeHead(200, {
      'Content-Type':
        contentTypes[path.extname(filePath).toLowerCase()] ??
        'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, { error: 'Build the web app with `yarn web:build`.' });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);
  try {
    if (request.method === 'POST' && url.pathname === '/api/rpc') {
      const { action, args = [] } = await readJson(request);
      sendJson(response, 200, { data: await dispatch(action, args) });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/upload') {
      sendJson(response, 200, { filePath: await uploadFile(request) });
      return;
    }

    if (request.method === 'GET') {
      await serveStatic(decodeURIComponent(url.pathname), response);
      return;
    }

    sendJson(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    sendJson(response, 500, { error: (error as Error).message });
  }
});

server.listen(port, host, () => {
  console.log(`Frappe Books is available at http://${host}:${port}`);
});
