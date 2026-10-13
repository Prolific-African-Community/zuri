import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy | Zuri" },
  description:
    "How Zuri uses Google API and business data, retains it, protects it, and supports user privacy rights.",
};

const contact = (
  <a href="mailto:prolificommunity@gmail.com">prolificommunity@gmail.com</a>
);

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      introduction="This policy explains what information Zuri processes, why it is needed, how connected Google data is handled, and the choices and rights available to users."
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
          title: "Information Zuri processes",
          content: (
            <>
              <p>
                <strong>Information supplied by users</strong> may include brand and company
                details, content and marketing material, sales and prospect information, and
                user-created notes or interactions.
              </p>
              <p>
                <strong>Information from connected services</strong> may include data retrieved
                from Google services or other integrations that a user chooses to connect.
              </p>
              <p>
                <strong>Publicly available research information</strong> may include business
                website content and other public sources examined as part of a user-requested
                research workflow.
              </p>
              <ul>
                <li>Account and authorization metadata needed to operate connected services;</li>
                <li>stored marketing, search, content, sales and reporting records; and</li>
                <li>technical information needed to operate, maintain and secure Zuri.</li>
              </ul>
            </>
          ),
        },
        {
          title: "Google API Data",
          content: (
            <>
              <p>
                Zuri connects to Google services only when a user explicitly authorizes access
                through OAuth 2.0. Zuri requests and uses only the Google scopes presented during
                that authorization. The data available to Zuri depends on the services the user
                connects and the access Google grants.
              </p>
              <ul>
                <li>
                  <strong>Google Search Console:</strong> search-performance data, including
                  queries, pages, clicks, impressions, click-through rate and position metrics
                  where Google provides them.
                </li>
                <li>
                  <strong>Google Ads:</strong> accessible account data, campaigns, ad groups,
                  keywords, search terms and related performance metrics such as impressions,
                  clicks, cost and conversions.
                </li>
                <li>
                  <strong>Google Business Profile:</strong> account and location information and,
                  when a user requests publication, the content and status of the relevant local
                  post.
                </li>
                <li>
                  <strong>OAuth connection data:</strong> authorization metadata and the access
                  and refresh tokens required to maintain an authorized connection.
                </li>
              </ul>
              <p>
                Zuri may securely store OAuth access and refresh tokens. These credentials are
                used only to maintain the integrations the user authorized and are not exposed to
                other Zuri users. Users can revoke Zuri&apos;s access at any time through their Google
                Account. Once access is revoked, Zuri cannot retrieve new Google data unless the
                user reconnects the integration.
              </p>
            </>
          ),
        },
        {
          title: "How Google data is used",
          content: (
            <p>
              Google data is used only to provide functionality requested by the user. Depending
              on the connected service, this includes search-performance analysis, SEO and search
              intelligence, advertising analysis, campaign diagnostics, marketing
              recommendations, content and distribution workflows, Google Business Profile
              publishing, reporting, and historical comparisons. Google-derived data is not used
              to advertise to Zuri users or for unrelated profiling.
            </p>
          ),
        },
        {
          title: "Google user-data sharing",
          content: (
            <>
              <p>
                Zuri does not sell Google user data, share it with advertisers, or use it for
                unrelated advertising or profiling. Data may be processed by infrastructure and
                service providers only where necessary to operate Zuri and deliver the specific
                functionality requested by the user, such as cloud hosting, database hosting,
                infrastructure operations or AI-assisted processing.
              </p>
              <p className="rounded-lg border border-accent-line bg-accent-soft px-4 py-3 text-ink">
                Zuri&apos;s use and transfer of information received from Google APIs complies with
                the Google API Services User Data Policy, including the Limited Use requirements.
              </p>
            </>
          ),
        },
        {
          title: "Purposes of processing",
          content: (
            <p>
              Zuri processes information to provide requested product functionality; produce
              analytics and reporting; deliver SEO and search insights, advertising intelligence,
              content workflows, sales intelligence and user-requested automation; and operate,
              maintain and secure the service. Zuri does not use connected data for purposes
              unrelated to these functions.
            </p>
          ),
        },
        {
          title: "Data retention",
          content: (
            <>
              <p>
                Connected Google data is retained only for as long as reasonably needed to
                provide Zuri functionality, maintain historical reporting requested by the user,
                and meet applicable legal obligations. OAuth credentials are retained only while
                the connection is active or otherwise necessary to provide the authorized
                integration.
              </p>
              <p>
                Users may disconnect Google at any time and may request deletion of connected
                Google data and associated credentials. Retention may continue where required by
                law or where limited records are reasonably necessary to establish or protect
                legal rights. Zuri does not promise a fixed deletion period where one is not
                implemented.
              </p>
            </>
          ),
        },
        {
          title: "Data deletion",
          content: (
            <p>
              A user may request deletion of account-related information, connected Google data,
              OAuth credentials, and stored marketing or search data where applicable by emailing
              {" "}{contact}. Requests are evaluated and fulfilled subject to identity
              verification, product capabilities and applicable legal obligations. Disconnecting
              Google prevents Zuri from retrieving new Google data unless the connection is later
              authorized again.
            </p>
          ),
        },
        {
          title: "Third-party services",
          content: (
            <>
              <p>Zuri uses a limited set of providers to deliver specific parts of the service:</p>
              <ul>
                <li>Google APIs provide user-authorized Google integrations;</li>
                <li>OpenAI supports requested AI-assisted analysis and content workflows;</li>
                <li>Vercel supports application hosting and delivery;</li>
                <li>database and cloud-hosting providers store and process service data; and</li>
                <li>DataForSEO supports requested search and public-market research.</li>
              </ul>
              <p>
                These providers process data only as necessary to support the requested Zuri
                functionality or operate its infrastructure. Zuri does not authorize them to use
                Google-derived data for their independent advertising purposes.
              </p>
            </>
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
