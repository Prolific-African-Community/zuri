"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Select, TextArea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/layout";
import { companyAction } from "@/app/dashboard/billing/actions";
import type { CompanyProfile } from "@/lib/billing/domain";
export const blankCompany: CompanyProfile = {
  name: "",
  legalForm: "",
  address: "",
  country: "Luxembourg",
  rcs: "",
  permit: "",
  vatStatus: "NORMAL",
  vatNumber: "",
  contact: "",
  email: "",
  phone: "",
  website: "",
  iban: "",
  bic: "",
  bank: "",
  paymentTerms: "Paiement par virement à l’échéance indiquée.",
  logo: "",
};
export function CompanyEditor({
  initial = blankCompany,
  id,
  revision = 0,
  prefix: initialPrefix = "FAC",
}: {
  initial?: CompanyProfile;
  id?: string;
  revision?: number;
  prefix?: string;
}) {
  const [profile, setProfile] = useState(initial),
    [prefix, setPrefix] = useState(initialPrefix),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const field = (
    key: keyof CompanyProfile,
    label: string,
    required = false,
  ) => (
    <Field
      key={key}
      label={label}
      required={required}
      value={profile[key]}
      onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
    />
  );
  return (
    <form
      className="mt-10"
      onSubmit={(e) => {
        e.preventDefault();
        const element = e.currentTarget;
        const form = new FormData(element);
        form.set("profile", JSON.stringify(profile));
        form.set("prefix", prefix);
        form.set("id", id ?? "");
        form.set("revision", String(revision));
        start(async () => {
          setError("");
          setMessage("");
          try {
            const r = await companyAction(form);
            if (r.error) {
              setError(r.error);
              return;
            }
            setMessage(r.message ?? "");
            if (r.profile) setProfile(r.profile);
            const logoInput = element.elements.namedItem("logo");
            if (logoInput instanceof HTMLInputElement) logoInput.value = "";
            router.push(`/dashboard/billing/companies?company=${r.id}`);
            router.refresh();
          } catch {
            setError("Impossible d’enregistrer le profil.");
          }
        });
      }}
    >
      {error && (
        <p
          role="alert"
          className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mb-6 rounded-lg bg-accent-soft p-4 text-sm">
          {message}
        </p>
      )}
      <fieldset disabled={pending}>
        <Section title="Identité légale">
          <div className="grid gap-5 sm:grid-cols-2">
            {field("name", "Raison sociale", true)}
            {field("legalForm", "Forme juridique", true)}
            <TextArea
              label="Adresse complète du siège"
              required
              value={profile.address}
              onChange={(e) =>
                setProfile({ ...profile, address: e.target.value })
              }
            />
            {field("country", "Pays", true)}
            {field("rcs", "Numéro RCS (si applicable)")}
            {field("permit", "Autorisation d’établissement (si applicable)")}
          </div>
        </Section>
        <Section title="Fiscalité">
          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="Statut TVA"
              value={profile.vatStatus}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  vatStatus: e.target.value as CompanyProfile["vatStatus"],
                })
              }
            >
              <option value="NORMAL">Assujetti — régime normal</option>
              <option value="EXEMPT">
                Franchise luxembourgeoise — article 57bis
              </option>
            </Select>
            {field("vatNumber", "Numéro TVA", profile.vatStatus === "NORMAL")}
          </div>
          <p className="type-meta mt-4">
            Le statut est explicite. L’absence de numéro TVA ne sélectionne
            jamais automatiquement un régime.
          </p>
        </Section>
        <Section title="Coordonnées">
          <div className="grid gap-5 sm:grid-cols-2">
            {field("contact", "Contact")}
            {field("email", "Email")}
            {field("phone", "Téléphone")}
            {field("website", "Site internet")}
          </div>
        </Section>
        <Section title="Paiement et numérotation">
          <div className="grid gap-5 sm:grid-cols-2">
            {field("iban", "IBAN")}
            {field("bic", "BIC")}
            {field("bank", "Banque")}
            <Field
              label="Préfixe de numérotation"
              required
              maxLength={12}
              pattern="[A-Z0-9]{1,12}"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            />
          </div>
          <div className="mt-5">
            <TextArea
              label="Modalités de paiement"
              value={profile.paymentTerms}
              onChange={(e) =>
                setProfile({ ...profile, paymentTerms: e.target.value })
              }
            />
          </div>
          <p className="type-meta mt-4">
            Séries continues par société : FAC-000001 et FAC-DEV-000001. Le
            préfixe est verrouillé à la première émission.
          </p>
        </Section>
        <Section title="Logo">
          <Field
            label="Importer un logo (PNG ou JPEG, 2 Mo maximum)"
            name="logo"
            type="file"
            accept="image/png,image/jpeg"
          />
          {profile.logo && (
            <div className="mt-4">
              <p className="type-meta">
                Un logo est enregistré. Il sera conservé sans nouvel upload.
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setProfile({ ...profile, logo: "", logoBlobUrl: "" })
                }
              >
                Retirer le logo
              </Button>
            </div>
          )}
        </Section>
        <Button className="mt-10" type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer le profil société"}
        </Button>
      </fieldset>
    </form>
  );
}
