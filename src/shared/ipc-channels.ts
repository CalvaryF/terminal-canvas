export const IPC_CHANNELS = {
  // PTY channels
  PTY_CREATE: 'pty:create',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_KILL: 'pty:kill',
  PTY_DATA: 'pty:data',
  PTY_EXIT: 'pty:exit',
  PTY_GET_CWD: 'pty:get-cwd',

  // Folder channels
  FOLDER_SELECT: 'folder:select',
  FOLDER_LIST: 'folder:list',
  FOLDER_WATCH: 'folder:watch',
  FOLDER_UNWATCH: 'folder:unwatch',
  FOLDER_FILE_ADDED: 'folder:file-added',
  FOLDER_COPY: 'folder:copy',
  FOLDER_READ_IMAGE: 'folder:read-image',
  FOLDER_READ_TEXT: 'folder:read-text',

  // Canvas save/load channels
  CANVAS_SAVE: 'canvas:save',
  CANVAS_LOAD: 'canvas:load',
  CANVAS_LIST: 'canvas:list',
  CANVAS_DELETE: 'canvas:delete'
} as const
