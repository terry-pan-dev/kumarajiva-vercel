import { RemixServer } from "@remix-run/react";
import { handleRequest } from "@vercel/remix";

export default function (
  request,
  responseStatusCode,
  responseHeaders,
  remixContext
) {
  let remixServer = <RemixServer url={request.url} context={remixContext} />;
  return handleRequest(
    request,
    responseStatusCode,
    responseHeaders,
    remixServer
  );
}
