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
  CANVAS_DELETE: 'canvas:delete',

  // Agent API channels (main -> renderer requests)
  AGENT_GET_STATE: 'agent:get-state',
  AGENT_CREATE_NODE: 'agent:create-node',
  AGENT_UPDATE_NODE: 'agent:update-node',
  AGENT_DELETE_NODE: 'agent:delete-node',
  AGENT_CREATE_EDGE: 'agent:create-edge',
  AGENT_DELETE_EDGE: 'agent:delete-edge',
  AGENT_SET_VIEWPORT: 'agent:set-viewport',
  AGENT_SET_FOCUSED: 'agent:set-focused',
  AGENT_ADD_QUEUE_COMMAND: 'agent:add-queue-command',
  AGENT_REMOVE_QUEUE_COMMAND: 'agent:remove-queue-command',

  // Agent API channels (renderer -> main responses)
  AGENT_RESPONSE: 'agent:response'
} as const
