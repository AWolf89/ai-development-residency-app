import AuthForm from "@/components/AuthForm";
import { login } from "@/lib/auth/actions";

export default function LoginPage() {
  return (
    <AuthForm
      action={login}
      title="Log in"
      submitLabel="Log in"
      altText="Need an account?"
      altHref="/signup"
      altLinkLabel="Sign up"
    />
  );
}
