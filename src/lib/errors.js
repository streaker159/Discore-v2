class UserFacingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserFacingError';
  }
}

function friendlyError(error) {
  if (error instanceof UserFacingError) return error.message;
  return 'Something went wrong while running that command.';
}

module.exports = { UserFacingError, friendlyError };
