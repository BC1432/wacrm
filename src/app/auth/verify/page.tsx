import { AuthVerifyForm } from "./verify-form";

export const dynamic = "force-dynamic";

export default function AuthVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    next?: string;
  }>;
}) {
  return (
    <AuthVerifyFormWrapper searchParams={searchParams} />
  );
}

async function AuthVerifyFormWrapper({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    next?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <AuthVerifyForm
      tokenHash={params.token_hash ?? ""}
      type={params.type ?? ""}
      next={params.next ?? ""}
    />
  );
}
