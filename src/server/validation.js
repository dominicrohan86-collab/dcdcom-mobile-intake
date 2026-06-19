export async function readJson(request, options = {}) {
  const maxBytes = options.maxBytes || 64 * 1024;
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new ValidationError(`Request body is too large. Maximum is ${maxBytes} bytes.`, 413);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ValidationError("Request body must be valid JSON.", 400);
  }
}

export function requiredString(payload, key, options = {}) {
  const value = String(payload?.[key] || "").trim();
  if (!value) throw new ValidationError(`${key} is required.`, 400);
  const maxLength = options.maxLength || 500;
  if (value.length > maxLength) throw new ValidationError(`${key} must be ${maxLength} characters or fewer.`, 400);
  return value;
}

export function optionalEnum(value, allowed, fallback) {
  const normalized = String(value || fallback || "").toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

export class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
