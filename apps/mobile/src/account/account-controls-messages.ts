export const accountControlMessages = {
  'accountControls.title': 'Your account data',
  'accountControls.unavailable':
    'Account export and deletion are unavailable until a verified account service is connected. Guest practice remains available.',
  'accountControls.reauth':
    'The trusted account service will ask you to verify your identity before export or deletion.',
  'accountControls.export': 'Export my data',
  'accountControls.exporting': 'Preparing private export...',
  'accountControls.delete': 'Delete my account',
  'accountControls.confirm':
    'Delete this account, its profile and its results? This cannot be undone. Local guest practice does not require an account.',
  'accountControls.cancel': 'Keep account',
  'accountControls.confirmDelete': 'Confirm account deletion',
  'accountControls.deleting': 'Submitting deletion and checking session revocation...',
  'accountControls.pending':
    'Deletion is saved and session revocation is still being confirmed. Account writes are paused. Your account is not yet confirmed deleted.',
  'accountControls.retry': 'Check deletion again',
  'accountControls.deleted':
    'The server confirmed account deletion and session revocation. Guest practice remains available.',
  'accountControls.privateExport': 'Private account export — keep this information private',
  'accountControls.copy': 'Copy export',
  'accountControls.clear': 'Clear displayed export',
  'accountControls.copied': 'Copied. Keep the exported information private.',
  'accountControls.exportError':
    'The export could not be prepared. Verify your account and try again.',
  'accountControls.deleteError':
    'Deletion could not be confirmed. Check its status with the trusted account service before trying again.',
  'accountControls.copyError': 'Copy is unavailable. You can select and copy the displayed export.',
} as const;
