import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy | Zuri" },
  description:
    "How Zuri collects, uses, protects and retains business, Google and user-provided data.",
};

const contact = (
  <a href="mailto:prolificommunity@gmail.com">prolificommunity@gmail.com</a>
);

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      introduction="This policy explains how Zuri handles information when you use the service or connect supported third-party accounts."
      sections={[
        {
          title: "Who operates Zuri",
          content: (
            <p>
              Zuri is operated by Prolific, Luxembourg. Questions about this policy or the
              handling of personal data can be sent to {contact}.
            </p>
          ),
        },
        {
          title: "What data Zuri processes",
          content: (
            <>
              <p>Zuri may process information entered, created or connected by a user, including:</p>
              <ul>
                <li>brand, business, content and marketing information;</li>
                <li>sales, prospect and contact information, plus user-created notes and interactions;</li>
                <li>Google Search Console and Google Ads data;</li>
                <li>Google Business Profile data, when that integration is connected; and</li>
                <li>public website and research information used in requested workflows.</li>
              </ul>
            </>
          ),
        },
        {
          title: "Google data and OAuth",
          content: (
            <>
              <p>
                Zuri connects to Google services through OAuth and requests access only to the
                scopes shown during Google&apos;s authorization process. Google data is used to
                provide the Zuri features the user requests, such as search-performance analysis,
                advertising insights and connected business-profile workflows.
              </p>
              <p>
                Zuri does not sell Google user data. Access and refresh tokens are stored
                server-side and used only to maintain integrations the user has authorized. A
                user can revoke Zuri&apos;s Google access at any time from the security settings of
                their Google Account; revocation may cause the related Zuri features to stop
                working until access is authorized again.
              </p>
            </>
          ),
        },
        {
          title: "Why data is processed",
          content: (
            <p>
              Data is processed to provide analytics, SEO and search insights, advertising
              intelligence, content workflows, prospect and sales intelligence, and automation
              explicitly requested by the user. It may also be processed to operate, secure and
              improve the service.
            </p>
          ),
        },
        {
          title: "Data retention",
          content: (
            <p>
              Information is retained for as long as reasonably needed to provide Zuri, maintain
              authorized integrations and meet applicable legal obligations. Data may be deleted
              or removed through available product functionality or following a valid request,
              subject to technical and legal requirements.
            </p>
          ),
        },
        {
          title: "Third-party services",
          content: (
            <p>
              Zuri relies on service providers where applicable, including Google APIs, OpenAI,
              Vercel, database and cloud-hosting providers, and DataForSEO. These providers may
              process limited information needed to deliver their part of the requested feature,
              under their own terms and data-protection commitments. Zuri does not disclose data
              to them for unrelated advertising or sale.
            </p>
          ),
        },
        {
          title: "Security",
          content: (
            <p>
              Zuri uses reasonable technical and organizational safeguards intended to protect
              information, including restricted server-side handling of integration credentials.
              No internet service or storage system can guarantee absolute security.
            </p>
          ),
        },
        {
          title: "Your rights",
          content: (
            <p>
              Where applicable, including under the GDPR, individuals may request access to,
              correction or deletion of their personal data, restriction of processing, or object
              to certain processing. These rights may be subject to legal conditions and
              exceptions. To make a request, contact {contact}.
            </p>
          ),
        },
        {
          title: "Last updated",
          content: <p>October 12, 2026</p>,
        },
      ]}
    />
  );
}
