import AuthForm from "@/components/AuthForm";
import { signup } from "@/lib/auth/actions";

export default function SignupPage() {
  return (
    <AuthForm
      action={signup}
      title="Create your account"
      submitLabel="Sign up"
      altText="Already have an account?"
      altHref="/login"
      altLinkLabel="Log in"
    />
  );
}
