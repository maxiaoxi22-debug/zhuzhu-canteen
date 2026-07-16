import { describe, expect, it } from "vitest";

import { RequestBodyTooLargeError, readRequestBodyBounded } from "../../src/lib/request-security";

describe("bounded request bodies", () => {
  it("stops a chunked body as soon as the streamed bytes cross the limit", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
      },
      cancel() { cancelled = true; },
    });
    const request = new Request("http://local.test/upload", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readRequestBodyBounded(request, 5)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(cancelled).toBe(true);
  });

  it("rejects a forged small Content-Length when streamed bytes are larger", async () => {
    const request = new Request("http://local.test/upload", {
      method: "POST",
      headers: { "content-length": "1" },
      body: new Uint8Array([1, 2, 3]),
    });

    await expect(readRequestBodyBounded(request, 2)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});
