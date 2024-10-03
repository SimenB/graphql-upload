// @ts-check

import "./test/polyfillFile.mjs";

import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { createServer } from "node:http";
import { describe, it } from "node:test";

import { listen } from "async-listen";
import express from "express";
import createError from "http-errors";

import graphqlUploadExpress from "./graphqlUploadExpress.mjs";
import processRequest from "./processRequest.mjs";

describe(
  "Function `graphqlUploadExpress`.",
  {
    concurrency: true,
  },
  () => {
    it("Non multipart request.", async () => {
      let processRequestRan = false;

      const server = createServer(
        express().use(
          graphqlUploadExpress({
            /** @type {any} */
            async processRequest() {
              processRequestRan = true;
            },
          }),
        ),
      );
      const url = await listen(server);

      try {
        await fetch(url, { method: "POST" });
        strictEqual(processRequestRan, false);
      } finally {
        server.close();
      }
    });

    it("Multipart request.", async () => {
      /**
       * @type {{
       *   variables: {
       *     file: import("./Upload.mjs").default,
       *   },
       * } | undefined}
       */
      let requestBody;

      const server = createServer(
        express()
          .use(graphqlUploadExpress())
          .use((request, response, next) => {
            requestBody = request.body;
            next();
          }),
      );
      const url = await listen(server);

      try {
        const body = new FormData();

        body.append(
          "operations",
          JSON.stringify({ variables: { file: null } }),
        );
        body.append("map", JSON.stringify({ 1: ["variables.file"] }));
        body.append("1", new File(["a"], "a.txt", { type: "text/plain" }));

        await fetch(url, { method: "POST", body });

        ok(requestBody);
        ok(requestBody.variables);
        ok(requestBody.variables.file);
      } finally {
        server.close();
      }
    });

    it("Multipart request and option `processRequest`.", async () => {
      let processRequestRan = false;

      /**
       * @type {{
       *   variables: {
       *     file: import("./Upload.mjs").default,
       *   },
       * } | undefined}
       */
      let requestBody;

      const server = createServer(
        express()
          .use(
            graphqlUploadExpress({
              processRequest(...args) {
                processRequestRan = true;
                return processRequest(...args);
              },
            }),
          )
          .use((request, response, next) => {
            requestBody = request.body;
            next();
          }),
      );

      const url = await listen(server);

      try {
        const body = new FormData();

        body.append(
          "operations",
          JSON.stringify({ variables: { file: null } }),
        );
        body.append("map", JSON.stringify({ 1: ["variables.file"] }));
        body.append("1", new File(["a"], "a.txt", { type: "text/plain" }));

        await fetch(url, { method: "POST", body });

        strictEqual(processRequestRan, true);
        ok(requestBody);
        ok(requestBody.variables);
        ok(requestBody.variables.file);
      } finally {
        server.close();
      }
    });

    it("Multipart request and option `processRequest` throwing an exposed HTTP error.", async () => {
      let expressError;
      let requestCompleted;
      let responseStatusCode;

      const error = createError(400, "Message.");
      const server = createServer(
        express()
          .use((request, response, next) => {
            const { send } = response;

            // @ts-ignore Todo: Find a less hacky way.
            response.send = (...args) => {
              requestCompleted = request.complete;
              response.send = send;
              response.send(...args);
            };

            next();
          })
          .use(
            graphqlUploadExpress({
              async processRequest(request) {
                request.resume();
                throw error;
              },
            }),
          )
          .use(
            /**
             * @param {Error} error
             * @param {import("express").Request} request
             * @param {import("express").Response} response
             * @param {import("express").NextFunction} next
             */
            (error, request, response, next) => {
              expressError = error;
              responseStatusCode = response.statusCode;

              // Sending a response here prevents the default Express error
              // handler from running, which would undesirably (in this case)
              // display the error in the console.
              if (response.headersSent) next(error);
              else response.send();
            },
          ),
      );

      const url = await listen(server);

      try {
        const body = new FormData();

        body.append(
          "operations",
          JSON.stringify({ variables: { file: null } }),
        );
        body.append("map", JSON.stringify({ 1: ["variables.file"] }));
        body.append("1", new File(["a"], "a.txt", { type: "text/plain" }));

        await fetch(url, { method: "POST", body });

        deepStrictEqual(expressError, error);
        ok(
          requestCompleted,
          "Response wasn’t delayed until the request completed.",
        );
        strictEqual(responseStatusCode, error.status);
      } finally {
        server.close();
      }
    });

    it("Multipart request following middleware throwing an error.", async () => {
      let expressError;
      let requestCompleted;

      const error = new Error("Message.");
      const server = createServer(
        express()
          .use((request, response, next) => {
            const { send } = response;

            // @ts-ignore Todo: Find a less hacky way.
            response.send = (...args) => {
              requestCompleted = request.complete;
              response.send = send;
              response.send(...args);
            };

            next();
          })
          .use(graphqlUploadExpress())
          .use(() => {
            throw error;
          })
          .use(
            /**
             * @param {Error} error
             * @param {import("express").Request} request
             * @param {import("express").Response} response
             * @param {import("express").NextFunction} next
             */
            (error, request, response, next) => {
              expressError = error;

              // Sending a response here prevents the default Express error
              // handler from running, which would undesirably (in this case)
              // display the error in the console.
              if (response.headersSent) next(error);
              else response.send();
            },
          ),
      );

      const url = await listen(server);

      try {
        const body = new FormData();

        body.append(
          "operations",
          JSON.stringify({ variables: { file: null } }),
        );
        body.append("map", JSON.stringify({ 1: ["variables.file"] }));
        body.append("1", new File(["a"], "a.txt", { type: "text/plain" }));

        await fetch(url, { method: "POST", body });

        deepStrictEqual(expressError, error);
        ok(
          requestCompleted,
          "Response wasn’t delayed until the request completed.",
        );
      } finally {
        server.close();
      }
    });
  },
);
