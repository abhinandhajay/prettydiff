import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom replaces the fetch API family with window-bound implementations.
// Server code under test (hono) builds real network responses with `new Response(...)`,
// so keep Bun's native classes — only the DOM itself should come from happy-dom.
const native = {
    fetch: globalThis.fetch,
    Headers: globalThis.Headers,
    Request: globalThis.Request,
    Response: globalThis.Response,
    FormData: globalThis.FormData,
    Blob: globalThis.Blob,
    File: globalThis.File,
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    ReadableStream: globalThis.ReadableStream,
    WritableStream: globalThis.WritableStream,
    TransformStream: globalThis.TransformStream,
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
};
GlobalRegistrator.register();
Object.assign(globalThis, native);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

if (typeof Element.prototype.scrollIntoView === "undefined") {
    Element.prototype.scrollIntoView = () => {};
}
