const SECRET_PATTERN =
  /\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{12,})\b|Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g;
const MAX_ERROR_MESSAGE_LENGTH = 160;

function truncate(value, maxLength = MAX_ERROR_MESSAGE_LENGTH) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function safeErrorDetails(error) {
  if (!error) {
    return {};
  }

  const details = {};
  if (typeof error.code === 'string') {
    details.code = error.code;
  }

  if (typeof error.message === 'string') {
    details.message = truncate(error.message.replace(SECRET_PATTERN, '[redacted]'));
  }

  return details;
}

export function warn(message, error, { consoleImpl = console } = {}) {
  consoleImpl.warn(message, safeErrorDetails(error));
}
