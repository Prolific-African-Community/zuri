import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: { absolute: "Terms of Use | Zuri" },
  description:
    "The terms governing access to and use of Zuri's business intelligence and workflow platform.",
};

const contact = (
  <a href="mailto:prolificommunity@gmail.com">prolificommunity@gmail.com</a>
);

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Use"
      introduction="These terms govern access to and use of Zuri. By using Zuri, you agree to use the service responsibly and in accordance with these terms."
      sections={[
        {
          title: "The service",
          content: (
            <p>
              Zuri is a business intelligence, marketing, content and sales-support platform
              operated by Prolific, Luxembourg.
            </p>
          ),
        },
        {
          title: "Intended use",
          content: (
            <>
              <p>Users may use Zuri to:</p>
              <ul>
                <li>manage brand and business intelligence;</li>
                <li>analyze marketing and search data;</li>
                <li>create and manage content workflows;</li>
                <li>manage sales intelligence and prospecting workflows; and</li>
                <li>connect supported third-party services.</li>
              </ul>
            </>
          ),
        },
        {
          title: "User responsibility",
          content: (
            <p>
              Users remain responsible for verifying generated content and recommendations,
              complying with applicable laws, ensuring any prospect or contact data is obtained
              and used lawfully, and making their own decisions based on Zuri outputs. Users must
              have the necessary rights and permissions for information they provide or connect.
            </p>
          ),
        },
        {
          title: "AI-generated output",
          content: (
            <p>
              Zuri may use artificial intelligence to generate analysis, content and
              recommendations. AI output can contain errors and is not guaranteed to be complete,
              current or accurate. Users should independently verify important information before
              publishing content, contacting people, spending money or otherwise acting on it.
            </p>
          ),
        },
        {
          title: "Third-party services",
          content: (
            <p>
              Google, OpenAI, DataForSEO and other connected services remain subject to their own
              terms, policies, technical limits and availability. Zuri does not control and is not
              responsible for changes, outages or restrictions imposed by those providers.
            </p>
          ),
        },
        {
          title: "Availability",
          content: (
            <p>
              Zuri is provided on an as-available basis. Maintenance, faults, security work or
              third-party dependencies may interrupt access, and uninterrupted or error-free
              operation is not guaranteed.
            </p>
          ),
        },
        {
          title: "Intellectual property",
          content: (
            <p>
              Zuri&apos;s software, interface, design and service materials remain owned by its
              operator or applicable licensors. Users retain their rights in business information
              and content they upload or provide, subject to any third-party rights. Users grant
              the permissions reasonably necessary for Zuri to process that material and provide
              the requested service.
            </p>
          ),
        },
        {
          title: "Prohibited use",
          content: (
            <p>
              Users must not use Zuri for unlawful activity, attempt unauthorized access, perform
              abusive or disruptive scraping, misuse personal data, interfere with other users,
              or attempt to compromise, evade or reverse-engineer the service&apos;s security and
              access controls.
            </p>
          ),
        },
        {
          title: "Limitation of liability",
          content: (
            <p>
              To the extent permitted by applicable law, Prolific is not liable for indirect or
              consequential loss arising from use of Zuri, reliance on generated output, or the
              failure of a third-party service. Nothing in these terms excludes liability that
              cannot lawfully be excluded. Users remain responsible for taking reasonable steps to
              prevent and limit foreseeable loss.
            </p>
          ),
        },
        {
          title: "Contact",
          content: <p>Questions about these terms can be sent to {contact}.</p>,
        },
        {
          title: "Last updated",
          content: <p>October 12, 2026</p>,
        },
      ]}
    />
  );
}
