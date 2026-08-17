import type { IPC } from 'main/preload';
import type { ConfigMap } from 'fyo/core/types';
import type { DatabaseMethod } from 'utils/db/types';
import type {
  ConfigFilesWithModified,
  LanguageMap,
  SelectFileOptions,
  SelectFileReturn,
  TemplateFile,
} from 'utils/types';

type RpcResponse<T> = { data: T };

async function rpc<T>(action: string, args: unknown[] = []): Promise<T> {
  const response = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
  });

  if (!response.ok) {
    throw new Error(`Web backend request failed: ${response.status}`);
  }

  return (await response.json() as RpcResponse<T>).data;
}

function download(data: string, name: string) {
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name.replace('download:', '');
  link.click();
  URL.revokeObjectURL(link.href);
}

function chooseFile(options: SelectFileOptions = {}): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.filters
      ?.flatMap((filter) => filter.extensions.map((extension) => `.${extension}`))
      .join(',') ?? '';
    input.onchange = () => resolve(input.files?.[0]);
    input.oncancel = () => resolve(undefined);
    input.click();
  });
}

async function upload(file: File): Promise<string> {
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'X-File-Name': encodeURIComponent(file.name) },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`File upload failed: ${response.status}`);
  }

  return (await response.json() as { filePath: string }).filePath;
}

function openPrintWindow(html: string) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    return false;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  return true;
}

const storageKey = 'frappe-books-web-config';

function loadStore() {
  try {
    const entries = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as [
      keyof ConfigMap,
      ConfigMap[keyof ConfigMap],
    ][];
    return new Map(entries);
  } catch {
    return new Map<keyof ConfigMap, ConfigMap[keyof ConfigMap]>();
  }
}

const store = loadStore();

function persistStore() {
  localStorage.setItem(storageKey, JSON.stringify([...store]));
}

const webIpc = {
  desktop: false,
  reloadWindow: () => window.location.reload(),
  minimizeWindow: () => undefined,
  toggleMaximize: () => undefined,
  isMaximized: async () => false,
  isFullscreen: async () => Boolean(document.fullscreenElement),
  closeWindow: () => undefined,
  getCreds: async () => rpc('get-creds'),
  getLanguageMap: async (code: string) => rpc<{
    languageMap: LanguageMap;
    success: boolean;
    message: string;
  }>('get-language-map', [code]),
  getTemplates: async (posTemplateWidth?: number) =>
    rpc<TemplateFile[]>('get-templates', [posTemplateWidth]),
  initScheduler: async (time: string) => rpc('init-scheduler', [time]),
  selectFile: async (
    options: SelectFileOptions
  ): Promise<SelectFileReturn> => {
    const file = await chooseFile(options);
    if (!file) {
      return {
        name: '',
        filePath: '',
        success: false,
        data: new Uint8Array(),
        canceled: true,
      };
    }

    return {
      name: file.name,
      filePath: await upload(file),
      success: true,
      data: new Uint8Array(await file.arrayBuffer()),
      canceled: false,
    };
  },
  getSaveFilePath: async (options: { defaultPath?: string } = {}) => {
    const defaultPath = options.defaultPath ?? 'frappe-books-export.txt';
    if (defaultPath.endsWith('.db')) {
      return {
        canceled: false,
        filePath: await rpc<string>('get-db-default-path', [
          defaultPath.replace(/\.db$/, ''),
        ]),
      };
    }

    return { canceled: false, filePath: `download:${defaultPath}` };
  },
  getOpenFilePath: async (options: SelectFileOptions = {}) => {
    const file = await chooseFile(options);
    return {
      canceled: !file,
      filePaths: file ? [await upload(file)] : [],
    };
  },
  checkDbAccess: async (filePath: string) =>
    rpc<boolean>('check-db-access', [filePath]),
  checkForUpdates: async () => undefined,
  openLink: (link: string) => window.open(link, '_blank', 'noopener,noreferrer'),
  deleteFile: async (filePath: string) => rpc('delete-file', [filePath]),
  saveData: async (data: string, savePath: string) => download(data, savePath),
  showItemInFolder: () => undefined,
  makePDF: async (html: string) => openPrintWindow(html),
  printDocument: async (html: string) => openPrintWindow(html),
  getDbList: async () => rpc<ConfigFilesWithModified[]>('get-db-list'),
  getDbDefaultPath: async (companyName: string) =>
    rpc<string>('get-db-default-path', [companyName]),
  getEnv: async () =>
    rpc<{ isDevelopment: boolean; platform: string; version: string }>('get-env'),
  openExternalUrl: (url: string) => window.open(url, '_blank', 'noopener,noreferrer'),
  showError: async (title: string, content: string) => window.alert(`${title}\n\n${content}`),
  sendError: async () => undefined,
  sendAPIRequest: async (endpoint: string, options: RequestInit | undefined) =>
    rpc('send-api-request', [endpoint, options]),
  registerMainProcessErrorListener: () => undefined,
  registerTriggerFrontendActionListener: () => undefined,
  registerConsoleLogListener: () => undefined,
  db: {
    getSchema: async () => rpc('db-schema'),
    create: async (dbPath: string, countryCode?: string) =>
      rpc('db-create', [dbPath, countryCode]),
    connect: async (dbPath: string, countryCode?: string) =>
      rpc('db-connect', [dbPath, countryCode]),
    call: async (method: DatabaseMethod, ...args: unknown[]) =>
      rpc('db-call', [method, ...args]),
    bespoke: async (method: string, ...args: unknown[]) =>
      rpc('db-bespoke', [method, ...args]),
  },
  store: {
    get: <K extends keyof ConfigMap>(key: K) => store.get(key) as ConfigMap[K],
    set: <K extends keyof ConfigMap>(key: K, value: ConfigMap[K]) => {
      store.set(key, value);
      persistStore();
      if (key === 'files') {
        void rpc('set-files', [value]);
      }
    },
    delete: <K extends keyof ConfigMap>(key: K) => {
      store.delete(key);
      persistStore();
    },
  },
} as const;

if (!window.ipc) {
  window.ipc = webIpc as IPC;
}
