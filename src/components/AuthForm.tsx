"use client";

import { useActionState } from "react";
import NextLink from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { AuthState } from "@/lib/auth/actions";

type AuthAction = (
  prevState: AuthState | undefined,
  formData: FormData
) => Promise<AuthState>;

type AuthFormProps = {
  action: AuthAction;
  title: string;
  submitLabel: string;
  altText: string;
  altHref: string;
  altLinkLabel: string;
};

export default function AuthForm({
  action,
  title,
  submitLabel,
  altText,
  altHref,
  altLinkLabel,
}: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <Container maxWidth="xs" sx={{ py: 10 }}>
      <Box component="form" action={formAction}>
        <Stack spacing={3}>
          <Typography variant="h4" component="h1">
            {title}
          </Typography>

          {state?.error ? <Alert severity="error">{state.error}</Alert> : null}
          {state?.notice ? (
            <Alert severity="success">{state.notice}</Alert>
          ) : null}

          <TextField
            name="email"
            type="email"
            label="Email"
            autoComplete="email"
            required
            fullWidth
          />
          <TextField
            name="password"
            type="password"
            label="Password"
            autoComplete="current-password"
            required
            fullWidth
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={pending}
          >
            {pending ? "Please wait…" : submitLabel}
          </Button>

          <Typography variant="body2" color="text.secondary">
            {altText}{" "}
            <Link component={NextLink} href={altHref}>
              {altLinkLabel}
            </Link>
          </Typography>
        </Stack>
      </Box>
    </Container>
  );
}
