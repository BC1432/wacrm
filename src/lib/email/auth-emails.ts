const FROM_NAME = "WACRM";

export const AUTH_EMAIL_DEFAULT_FROM = "no-reply@crm.evento.do";
export const AUTH_EMAIL_FROM_NAME = FROM_NAME;

export function buildSignupEmailText(actionLink: string): string {
  return [
    "Confirma tu cuenta en WACRM",
    "",
    "Abre este enlace para terminar de crear tu cuenta:",
    actionLink,
    "",
    "Si no solicitaste esta cuenta, puedes ignorar este mensaje.",
  ].join("\n");
}

export function buildSignupEmailHtml(actionLink: string): string {
  return baseEmailHtml({
    title: "Confirma tu cuenta en WACRM",
    body: "Abre este enlace para terminar de crear tu cuenta:",
    actionLabel: "Confirmar cuenta",
    actionLink,
  });
}

export function buildPasswordResetEmailText(actionLink: string): string {
  return [
    "Restablece tu contraseña en WACRM",
    "",
    "Abre este enlace para crear una contraseña nueva:",
    actionLink,
    "",
    "Si no solicitaste este cambio, puedes ignorar este mensaje.",
  ].join("\n");
}

export function buildPasswordResetEmailHtml(actionLink: string): string {
  return baseEmailHtml({
    title: "Restablece tu contraseña en WACRM",
    body: "Abre este enlace para crear una contraseña nueva:",
    actionLabel: "Restablecer contraseña",
    actionLink,
    note: "Si no solicitaste este cambio, puedes ignorar este mensaje.",
  });
}

function baseEmailHtml(input: {
  title: string;
  body: string;
  actionLabel: string;
  actionLink: string;
  note?: string;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h1 style="font-size: 20px;">${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.body)}</p>
      <p>
        <a href="${escapeHtml(input.actionLink)}" style="display: inline-block; padding: 10px 14px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px;">
          ${escapeHtml(input.actionLabel)}
        </a>
      </p>
      <p style="font-size: 13px; color: #6b7280;">${escapeHtml(
        input.note ?? "Si no solicitaste este mensaje, puedes ignorarlo."
      )}</p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
