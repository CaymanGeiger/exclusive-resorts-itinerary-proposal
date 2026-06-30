export const jsonError = (message: string, status = 400) =>
  Response.json({ error: message }, { status });

export const parseId = (value: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function readJsonObject(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false as const, response: jsonError("Request body must be valid JSON.") };
  }

  if (!isObject(body)) {
    return { ok: false as const, response: jsonError("Body must be an object.") };
  }

  return { ok: true as const, body };
}

export async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
