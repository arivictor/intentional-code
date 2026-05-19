import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const BASE_URL = "https://intentionalcode.com";
const SITE_NAME = "Intentional Code";

export default function PageMeta({ title, description, jsonLd = null }) {
  const { pathname } = useLocation();
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} with Go`;
  const canonical = `${BASE_URL}${pathname}`;
  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}
