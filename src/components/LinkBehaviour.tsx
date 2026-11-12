"use client";

import NextLink from "next/link";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";

/**
 * Adapter so MUI components can use the Next.js client-side router for links.
 *
 * Passing `component={NextLink}` to a MUI component directly from a Server
 * Component fails ("Functions cannot be passed to Client Components"), because a
 * function can't cross the server→client prop boundary. Instead we register this
 * (client) component once as MUI's default LinkComponent in the theme, so Server
 * Components only ever pass a plain string `href` and still get SPA navigation.
 */
const LinkBehaviour = forwardRef<
  HTMLAnchorElement,
  ComponentPropsWithoutRef<typeof NextLink>
>(function LinkBehaviour(props, ref) {
  return <NextLink ref={ref} {...props} />;
});

export default LinkBehaviour;
