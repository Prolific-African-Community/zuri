"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Select, TextArea } from "@/components/ui/field";
import { Panel, Section } from "@/components/ui/layout";
import {
  calculate,
  type Draft,
  type CompanyProfile,
  type Party,
} from "@/lib/billing/domain";
import {
  saveDocumentAction,
  documentAction,
  customerAction,
} from "@/app/dashboard/billing/actions";

type Company = { id: string; name: string; profile: CompanyProfile };
type Props = {
  brands: { id: string; name: string }[];
  companies: Company[];
  customers: { id: string; name: string; details: Party }[];
  initial: Draft;
  id?: string;
  revision?: number;
  status?: string;
  number?: string | null;
};
export function DocumentEditor({
  brands,
  companies,
  customers,
  initial,
  id,
  revision = 0,
  status = "DRAFT",
  number,
}: Props) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const locked = d.type === "INVOICE" && status !== "DRAFT";
  const change = (patch: Partial<Draft>) => {
    setD({ ...d, ...patch });
    setDirty(true);
    setPreview(false);
    setConfirmed(false);
  };
  const party = (key: keyof Party, value: string) =>
    change({ customer: { ...d.customer, [key]: value } });
  const line = (i: number, key: string, value: string) =>
    change({
      lines: d.lines.map((l, n) => (n === i ? { ...l, [key]: value } : l)),
    });
  const run = (
    fn: () => Promise<{ id?: string; error?: string; message?: string }>,
    navigate = true,
  ) =>
    start(async () => {
      setMessage("");
      setError("");
      try {
        const r = await fn();
        if (r.error) {
          setError(r.error);
          return;
        }
        setMessage(r.message ?? "");
        if (navigate && r.id) {
          setDirty(false);
          router.push(`/dashboard/billing/${r.id}`);
          router.refresh();
        }
      } catch {
        setError("Impossible de joindre le serveur.");
      }
    });
  const save = () => run(() => saveDocumentAction(d, id, revision));
  const act = (action: string) =>
    run(() => documentAction(id!, action, revision));
  let totals: ReturnType<typeof calculate> | null = null;
  try {
    totals = calculate(d.lines, d.vatMode);
  } catch {}
  const setMode = (mode: Draft["vatMode"]) =>
    change({
      vatMode: mode,
      lines: d.lines.map((l) => ({
        ...l,
        vatRate: mode === "NORMAL" ? "17" : "0",
      })),
    });
  return (
    <div className="mt-10 space-y-8">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg bg-accent-soft p-4 text-sm">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className="type-label">
          {number ?? (id ? "Brouillon enregistré" : "Nouveau brouillon")} ·{" "}
          {
            (
              {
                DRAFT: "Brouillon",
                ISSUED: "Émis",
                PAID: "Payé",
                SENT: "Envoyé",
                ACCEPTED: "Accepté",
                REFUSED: "Refusé",
              } as Record<string, string>
            )[status]
          }
        </span>
        {dirty && (
          <span className="type-meta">Modifications non enregistrées</span>
        )}
      </div>
      {locked && (
        <p className="type-body text-ink-3">
          Cette facture est émise. Ses informations légales et son PDF sont
          conservés et verrouillés.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <fieldset
          disabled={locked || pending}
          className="space-y-10 disabled:opacity-75"
        >
          <Panel>
            <div className="grid gap-5 sm:grid-cols-2">
              <Select
                label="Document"
                value={d.type}
                disabled={Boolean(id)}
                onChange={(e) =>
                  change({ type: e.target.value as Draft["type"] })
                }
              >
                <option value="INVOICE">Facture</option>
                <option value="QUOTE">Devis</option>
              </Select>
              <Select
                label="Brand"
                value={d.brandId}
                onChange={(e) => change({ brandId: e.target.value })}
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Société émettrice"
                value={d.companyId}
                onChange={(e) => {
                  const c = companies.find((c) => c.id === e.target.value)!;
                  change({
                    companyId: c.id,
                    vatMode: c.profile.vatStatus,
                    lines: d.lines.map((l) => ({
                      ...l,
                      vatRate: c.profile.vatStatus === "EXEMPT" ? "0" : "17",
                    })),
                  });
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Field
                label="Devise"
                value={d.currency}
                maxLength={3}
                required
                onChange={(e) =>
                  change({ currency: e.target.value.toUpperCase() })
                }
              />
            </div>
            <p className="type-meta mt-5">
              Les mentions juridiques et bancaires proviennent de la société
              émettrice.
            </p>
          </Panel>
          <Section title="Client">
            <div className="grid gap-5 sm:grid-cols-2">
              <Select
                label="Client enregistré"
                defaultValue=""
                onChange={(e) => {
                  const c = customers.find((c) => c.id === e.target.value);
                  if (c) change({ customer: c.details });
                }}
              >
                <option value="">Saisir un client</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Type de client"
                value={d.customer.kind}
                onChange={(e) => party("kind", e.target.value)}
              >
                <option value="BUSINESS">Entreprise</option>
                <option value="PERSON">Particulier</option>
              </Select>
              <Field
                label="Nom / raison sociale"
                value={d.customer.name}
                required
                onChange={(e) => party("name", e.target.value)}
              />
              <Field
                label="Pays"
                value={d.customer.country}
                required
                onChange={(e) => party("country", e.target.value)}
              />
              <TextArea
                label="Adresse complète"
                value={d.customer.address}
                required
                rows={3}
                onChange={(e) => party("address", e.target.value)}
              />
              <div className="grid gap-5">
                <Field
                  label="Email"
                  type="email"
                  value={d.customer.email}
                  onChange={(e) => party("email", e.target.value)}
                />
                <Field
                  label="Téléphone"
                  value={d.customer.phone}
                  onChange={(e) => party("phone", e.target.value)}
                />
              </div>
              <Field
                label="Numéro TVA du client"
                value={d.customer.vatNumber}
                onChange={(e) => party("vatNumber", e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-5"
              onClick={() => run(() => customerAction(d.customer), false)}
            >
              Enregistrer ce client
            </Button>
          </Section>
          <Section title="Références">
            <div className="grid gap-5 sm:grid-cols-3">
              {(
                [
                  ["issueDate", "Date d’émission"],
                  ["serviceDate", "Date de prestation"],
                  [
                    "dueDate",
                    d.type === "QUOTE" ? "Valable jusqu’au" : "Échéance",
                  ],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  type="date"
                  required
                  value={d[key]}
                  onChange={(e) => change({ [key]: e.target.value })}
                />
              ))}
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field
                label="Objet"
                value={d.subject}
                onChange={(e) => change({ subject: e.target.value })}
              />
              <Field
                label="Référence"
                value={d.reference}
                onChange={(e) => change({ reference: e.target.value })}
              />
            </div>
          </Section>
          <Section title="Prestations">
            <Select
              label="Régime TVA explicite"
              value={d.vatMode}
              onChange={(e) => setMode(e.target.value as Draft["vatMode"])}
            >
              <option value="NORMAL">Régime normal</option>
              <option value="EXEMPT">
                Franchise luxembourgeoise (article 57bis)
              </option>
              <option value="REVERSE">Autoliquidation</option>
            </Select>
            {d.vatMode === "REVERSE" && (
              <div className="mt-5 space-y-4">
                <TextArea
                  label="Fondement de l’autoliquidation applicable à cette opération"
                  value={d.reverseBasis}
                  required
                  onChange={(e) => change({ reverseBasis: e.target.value })}
                />
                <label className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={d.reverseConfirmed}
                    onChange={(e) =>
                      change({ reverseConfirmed: e.target.checked })
                    }
                  />
                  J’ai vérifié l’applicabilité de l’autoliquidation pour cette
                  opération et ce client.
                </label>
              </div>
            )}
            <div className="mt-6 space-y-4">
              {d.lines.map((l, i) => (
                <Panel key={i} className="p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="type-label">Prestation {i + 1}</span>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Monter la ligne ${i + 1}`}
                        disabled={i === 0}
                        onClick={() => {
                          const lines = [...d.lines];
                          [lines[i - 1], lines[i]] = [lines[i], lines[i - 1]];
                          change({ lines });
                        }}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Descendre la ligne ${i + 1}`}
                        disabled={i === d.lines.length - 1}
                        onClick={() => {
                          const lines = [...d.lines];
                          [lines[i + 1], lines[i]] = [lines[i], lines[i + 1]];
                          change({ lines });
                        }}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={d.lines.length === 1}
                        onClick={() =>
                          change({ lines: d.lines.filter((_, n) => n !== i) })
                        }
                      >
                        Supprimer
                      </Button>
                    </div>
                  </div>
                  <TextArea
                    label="Description"
                    rows={2}
                    value={l.description}
                    required
                    onChange={(e) => line(i, "description", e.target.value)}
                  />
                  <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {(
                      [
                        ["quantity", "Quantité"],
                        ["unit", "Unité"],
                        ["unitPrice", "Prix unitaire HT"],
                        ["vatRate", "TVA %"],
                      ] as const
                    ).map(([key, label]) => (
                      <Field
                        key={key}
                        label={label}
                        value={l[key]}
                        inputMode={key === "unit" ? "text" : "decimal"}
                        readOnly={key === "vatRate" && d.vatMode !== "NORMAL"}
                        required
                        onChange={(e) => line(i, key, e.target.value)}
                      />
                    ))}
                  </div>
                </Panel>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-5"
              onClick={() =>
                change({
                  lines: [
                    ...d.lines,
                    {
                      description: "",
                      quantity: "1",
                      unit: "service",
                      unitPrice: "0",
                      vatRate: d.vatMode === "NORMAL" ? "17" : "0",
                    },
                  ],
                })
              }
            >
              Ajouter une prestation
            </Button>
            {totals && (
              <div className="ml-auto mt-8 max-w-sm space-y-3 text-sm">
                <div className="flex justify-between">
                  <span>Total HT</span>
                  <span>
                    {totals.net} {d.currency}
                  </span>
                </div>
                {totals.taxes.map((t) => (
                  <div key={t.rate} className="flex justify-between text-ink-3">
                    <span>
                      TVA {t.rate} % · base {t.net}
                    </span>
                    <span>{t.vat}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-line pt-4 text-lg font-semibold">
                  <span>Total TTC</span>
                  <span>
                    {totals.gross} {d.currency}
                  </span>
                </div>
              </div>
            )}
          </Section>
          <TextArea
            label="Notes et conditions complémentaires"
            value={d.notes}
            onChange={(e) => change({ notes: e.target.value })}
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer le brouillon"}
          </Button>
        </fieldset>
      </form>
      {id && (
        <Section title="Document et émission">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={pending || dirty}
              onClick={() => {
                setPreview(true);
                setConfirmed(false);
              }}
            >
              Prévisualiser le PDF enregistré
            </Button>
            <ButtonLink
              variant="secondary"
              href={`/dashboard/billing/${id}/pdf?download`}
            >
              Télécharger le PDF
            </ButtonLink>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => act("DUPLICATE")}
            >
              Dupliquer
            </Button>
            {status === "ISSUED" && (
              <Button
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Marquer cette facture comme payée ?"))
                    act("PAID");
                }}
              >
                Marquer payée
              </Button>
            )}
            {d.type === "QUOTE" && status === "SENT" && (
              <>
                <Button
                  disabled={pending || dirty}
                  onClick={() => act("ACCEPTED")}
                >
                  Accepter le devis
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending || dirty}
                  onClick={() => act("REFUSED")}
                >
                  Refuser le devis
                </Button>
              </>
            )}
            {d.type === "QUOTE" && status === "ACCEPTED" && (
              <Button
                disabled={pending || dirty}
                onClick={() => act("CONVERT")}
              >
                Convertir en facture
              </Button>
            )}
          </div>
          {preview && (
            <div className="mt-6">
              <iframe
                title="Prévisualisation A4"
                className="h-[650px] w-full rounded-xl border border-line bg-white"
                src={`/dashboard/billing/${id}/pdf?v=${revision}`}
              />
              <a
                href={`/dashboard/billing/${id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="type-meta mt-3 inline-block text-accent-ink"
              >
                Ouvrir le PDF dans un nouvel onglet
              </a>
            </div>
          )}
          {status === "DRAFT" && !dirty && preview && (
            <div className="mt-6 space-y-4">
              <label className="flex gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                J’ai vérifié le PDF, les informations légales et le régime TVA.
                {d.type === "INVOICE"
                  ? " L’émission verrouille définitivement cette facture."
                  : " Le devis sera marqué envoyé ; aucun email ne sera envoyé par Zuri."}
              </label>
              <Button
                disabled={!confirmed || pending}
                onClick={() => act("ISSUE")}
              >
                {pending
                  ? "Émission…"
                  : d.type === "INVOICE"
                    ? "Émettre la facture"
                    : "Émettre le devis / marquer envoyé"}
              </Button>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
