import { Fragment, useEffect, useState } from "react";

const ABOUT_GREETINGS = [
  "Hi",
  "नमस्ते",
  "Bonjour",
  "こんにちは",
  "Hola",
  "สวัสดี",
  "안녕하세요",
  "Hallo",
];

const ABOUT_GREETING_PATTERN = /^Hi([!,.?]?)(\s*)(.*)$/i;
const ABOUT_GREETING_FADE_MS = 350;
const ABOUT_GREETING_VISIBLE_MS = 1250;
const LOCAL_DATA_ROOT = "/data";
const GITHUB_DATA_ROOT =
  "https://raw.githubusercontent.com/VarunSambanni/travel-blog-data-store/main/data";
const DEFAULT_CONTENT_SOURCE = "github";
const FLAG_API_STYLE = "flat";
const FLAG_API_SIZE = 24;
const COUNTRY_FLAG_ALIASES = {
  england: "GB",
  scotland: "GB",
  southkorea: "KR",
  northkorea: "KP",
  usa: "US",
  unitedstates: "US",
  unitedstatesofamerica: "US",
  uk: "GB",
  unitedkingdom: "GB",
};

function toRouteSegment(title, index) {
  const normalized = (title ?? `trip-${index + 1}`)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `trip-${index + 1}`;
}

function isMeaningfulHeading(value) {
  return Boolean(value && value.toLowerCase() !== "none");
}

function getSplitSectionFlag(section) {
  return Boolean(
    section?.["split-section"] ??
    section?.splitSection ??
    section?.split_section,
  );
}

function getTitleImage(trip) {
  return trip?.data?.title_image ?? trip?.data?.title_imgae ?? null;
}

function normalizeCountryName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "");
}

let countryCodeLookup;

function getCountryCodeLookup() {
  if (countryCodeLookup) {
    return countryCodeLookup;
  }

  const lookup = new Map(
    Object.entries(COUNTRY_FLAG_ALIASES).map(([name, code]) => [name, code]),
  );

  if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    for (const firstLetter of alphabet) {
      for (const secondLetter of alphabet) {
        const regionCode = `${firstLetter}${secondLetter}`;
        const regionName = displayNames.of(regionCode);

        if (!regionName || regionName === regionCode) {
          continue;
        }

        lookup.set(normalizeCountryName(regionName), regionCode);
      }
    }
  }

  countryCodeLookup = lookup;
  return lookup;
}

function getFlagUrl(country) {
  const normalizedCountry = normalizeCountryName(country);

  if (!normalizedCountry) {
    return "";
  }

  const countryCode =
    /^[a-z]{2}$/i.test(String(country ?? "")) ?
      String(country).toUpperCase()
    : getCountryCodeLookup().get(normalizedCountry) ?? "";

  if (!countryCode) {
    return "";
  }

  return `https://flagsapi.com/${countryCode}/${FLAG_API_STYLE}/${FLAG_API_SIZE}.png`;
}

function getCoverPositionValue(config) {
  const position =
    typeof config?.position === "object" && config.position !== null
      ? config.position
      : config;

  if (!position || typeof position !== "object") {
    return "50% 50%";
  }

  const horizontal = position.left
    ? `calc(50% - ${position.left})`
    : position.right
      ? `calc(50% + ${position.right})`
      : (position.x ?? "50%");
  const vertical = position.top
    ? `calc(50% - ${position.top})`
    : position.bottom
      ? `calc(50% + ${position.bottom})`
      : (position.y ?? "50%");

  return `${horizontal} ${vertical}`;
}

function renderFormattedText(value) {
  const text = typeof value === "string" ? value : "";
  const parts = text.split(/(\*\*.*?\*\*)/g).filter(Boolean);

  return parts.map((part, index) => {
    const boldMatch = part.match(/^\*\*(.*?)\*\*$/);

    if (boldMatch) {
      return <strong key={`bold-${index}`}>{boldMatch[1]}</strong>;
    }

    return <Fragment key={`text-${index}`}>{part}</Fragment>;
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return response.json();
}

function getCurrentSearch() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.search;
}

function getAppHref(pathname) {
  return `${pathname}${getCurrentSearch()}`;
}

function getContentSource() {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const querySource =
      params.get("contentSource")?.toLowerCase() ??
      params.get("source")?.toLowerCase();

    if (querySource === "local" || querySource === "github") {
      return querySource;
    }
  }

  const envSource = import.meta.env.VITE_CONTENT_SOURCE?.toLowerCase();

  if (envSource === "local" || envSource === "github") {
    return envSource;
  }

  return DEFAULT_CONTENT_SOURCE;
}

function resolveContentUrl(path, contentSource) {
  if (typeof path !== "string" || !path) {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (contentSource === "local") {
    if (normalizedPath.startsWith("/data/")) {
      return normalizedPath;
    }

    return `${LOCAL_DATA_ROOT}/${normalizedPath.replace(/^\/+/, "")}`;
  }

  const relativePath = normalizedPath.startsWith("/data/")
    ? normalizedPath.slice("/data/".length)
    : normalizedPath.replace(/^\/+/, "");

  return `${GITHUB_DATA_ROOT}/${relativePath}`;
}

function rewriteContentUrls(value, contentSource) {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteContentUrls(item, contentSource));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => {
        if (key === "url" && typeof entryValue === "string") {
          return [key, resolveContentUrl(entryValue, contentSource)];
        }

        return [key, rewriteContentUrls(entryValue, contentSource)];
      }),
    );
  }

  return value;
}

async function loadTrips(contentSource) {
  const tripIndex = await fetchJson(
    resolveContentUrl("/data/trips.json", contentSource),
  );

  if (!Array.isArray(tripIndex)) {
    throw new Error("Expected data/trips.json to contain an array.");
  }

  const loadedTrips = await Promise.all(
    tripIndex.map(async (entry, index) => {
      const fileUrl = entry.file
        ? resolveContentUrl(entry.file, contentSource)
        : "";
      const rawData = fileUrl ? await fetchJson(fileUrl) : {};
      const data = rewriteContentUrls(rawData, contentSource);

      return {
        title: entry.title ?? `Trip ${index + 1}`,
        file: entry.file ?? "",
        date: entry.date ?? "",
        description: entry.description ?? "",
        route: `/trips/${toRouteSegment(entry.title, index)}`,
        data,
      };
    }),
  );

  return loadedTrips;
}

async function loadAbout(contentSource) {
  const aboutData = await fetchJson(
    resolveContentUrl("/data/about.json", contentSource),
  );

  return rewriteContentUrls(aboutData, contentSource);
}

function getCurrentPath() {
  if (typeof window === "undefined") {
    return "/";
  }

  return window.location.pathname;
}

function SiteLink({ href, onNavigate, className, children }) {
  function handleClick(event) {
    event.preventDefault();
    onNavigate(href);
  }

  return (
    <a className={className} href={getAppHref(href)} onClick={handleClick}>
      {children}
    </a>
  );
}

function HomePage({ trips, onNavigate }) {
  const [searchQuery, setSearchQuery] = useState("");

  if (!trips.length) {
    return (
      <section className="content-panel" aria-label="No trips yet">
        <h1>No trips yet</h1>
        <p>Add entries to `public/data/trips.json` to start rendering cards.</p>
      </section>
    );
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredTrips = trips.filter((trip) =>
    trip.title.toLowerCase().includes(normalizedQuery),
  );

  return (
    <section className="content-body" aria-label="Trip blog cards">
      <div className="trip-search">
        <span aria-hidden="true" className="trip-search-icon">
          <svg
            fill="none"
            height="16"
            viewBox="0 0 16 16"
            width="16"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeLinecap="round" />
          </svg>
        </span>
        <input
          aria-label="Search trips by title"
          className="trip-search-input"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search"
          type="search"
          value={searchQuery}
        />
      </div>
      {filteredTrips.length ?
        filteredTrips.map((trip) => {
          const titleImage = getTitleImage(trip);
          const flagUrl = getFlagUrl(titleImage?.flag);

          return (
            <article className="trip-card" key={trip.route}>
              <SiteLink
                className="trip-card-link"
                href={trip.route}
                onNavigate={onNavigate}
              >
                <div className="trip-card-media">
                  {titleImage?.url ? (
                    <img
                      className="trip-card-media-image"
                      src={titleImage.url}
                      alt={trip.title}
                    />
                  ) : (
                    <span>Image Placeholder</span>
                  )}
                </div>
                <div className="trip-card-content">
                  <h2>{renderFormattedText(trip.title)}</h2>
                  <p className="trip-card-date">
                    {renderFormattedText(
                      trip.date || trip.data?.date || "Date Placeholder",
                    )}
                  </p>
                  <p
                    aria-hidden={!trip.description}
                    className={`trip-card-description${
                      trip.description ? "" : " trip-card-description-empty"
                    }`}
                  >
                    {trip.description ?
                      renderFormattedText(trip.description)
                    : null}
                  </p>
                  <div className="trip-card-spacer" aria-hidden="true" />
                  {flagUrl ? (
                    <div className="trip-card-flag-row">
                      <img
                        alt={`${titleImage.flag} flag`}
                        className="trip-card-flag"
                        loading="lazy"
                        src={flagUrl}
                      />
                    </div>
                  ) : null}
                </div>
              </SiteLink>
            </article>
          );
        })
      : <p className="trip-search-empty">No match found</p>}
    </section>
  );
}

function SectionText({ content }) {
  const heading = content?.heading;
  const paragraphs = Array.isArray(content?.paras) ? content.paras : [];

  return (
    <div className="section-copy">
      {isMeaningfulHeading(heading) ? (
        <h2 className="section-heading">{renderFormattedText(heading)}</h2>
      ) : null}
      {paragraphs.map((paragraph, index) => (
        <p key={`${paragraph}-${index}`}>{renderFormattedText(paragraph)}</p>
      ))}
    </div>
  );
}

function SectionList({ content }) {
  const heading = content?.heading;
  const items = Array.isArray(content?.items) ? content.items : [];

  return (
    <div className="section-copy">
      {isMeaningfulHeading(heading) ? (
        <h2 className="section-heading">{renderFormattedText(heading)}</h2>
      ) : null}
      <ul className="section-list">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{renderFormattedText(item)}</li>
        ))}
      </ul>
    </div>
  );
}

function AnimatedGreeting({ suffix = "" }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const fadeOutTimeoutId = setTimeout(() => {
      setIsVisible(false);
    }, ABOUT_GREETING_VISIBLE_MS);

    const nextGreetingTimeoutId = setTimeout(() => {
      setActiveIndex(
        (currentIndex) => (currentIndex + 1) % ABOUT_GREETINGS.length,
      );
      setIsVisible(true);
    }, ABOUT_GREETING_VISIBLE_MS + ABOUT_GREETING_FADE_MS);

    return () => {
      clearTimeout(fadeOutTimeoutId);
      clearTimeout(nextGreetingTimeoutId);
    };
  }, [activeIndex]);

  return (
    <span
      aria-label={ABOUT_GREETINGS[activeIndex]}
      className={`about-greeting${isVisible ? "" : " about-greeting-hidden"}`}
    >
      {ABOUT_GREETINGS[activeIndex]}
      {suffix}
    </span>
  );
}

function AboutLeadParagraph({ paragraph }) {
  const match =
    typeof paragraph === "string"
      ? paragraph.match(ABOUT_GREETING_PATTERN)
      : null;

  if (!match) {
    return <p>{renderFormattedText(paragraph)}</p>;
  }

  const [, punctuation = "", whitespace = " ", remainder = ""] = match;

  return (
    <p>
      <span className="about-greeting-slot">
        <AnimatedGreeting suffix={punctuation} />
      </span>
      {whitespace}
      {renderFormattedText(remainder)}
    </p>
  );
}

function SectionImage({ url, alt, caption }) {
  return (
    <figure className="section-figure">
      <div className="section-figure-media">
        {url ? (
          <img className="section-image" src={url} alt={alt} />
        ) : (
          <div className="section-image-placeholder">Image Placeholder</div>
        )}
      </div>
      {caption ? (
        <figcaption className="section-image-caption">
          {renderFormattedText(caption)}
        </figcaption>
      ) : null}
    </figure>
  );
}

function SectionBlock({ block, alt }) {
  if (!block) {
    return null;
  }

  if (block.type === "image" || (block.url && !block.content)) {
    return <SectionImage alt={alt} caption={block.caption} url={block.url} />;
  }

  if (block.type === "list") {
    return <SectionList content={block.content} />;
  }

  if (block.type === "text" || block.content) {
    return <SectionText content={block.content} />;
  }

  return null;
}

function TripPage({ trip }) {
  const sections = Array.isArray(trip.data?.body?.sections)
    ? trip.data.body.sections
    : [];
  const titleImage = getTitleImage(trip);

  return (
    <section className="detail-body" aria-label={trip.title}>
      <div className="detail-media">
        {titleImage?.url ? (
          <div
            className="detail-media-image"
            aria-label={trip.title}
            role="img"
            style={{
              backgroundImage: `url("${titleImage.url}")`,
              backgroundPosition: getCoverPositionValue(titleImage),
            }}
          />
        ) : (
          <span>Image Placeholder</span>
        )}
      </div>
      <article className="detail-content">
        <h1>{renderFormattedText(trip.title)}</h1>
        {trip.data?.date ? (
          <p className="detail-date">{renderFormattedText(trip.data.date)}</p>
        ) : null}
        <div className="detail-reading">
          {sections.map((section, index) => {
            const isSplit = getSplitSectionFlag(section);

            if (isSplit) {
              return (
                <section
                  className="detail-section detail-section-split"
                  key={`section-${index + 1}`}
                >
                  <div className="section-side">
                    <SectionBlock
                      alt={`${trip.title} left section ${index + 1}`}
                      block={section.left}
                    />
                  </div>
                  <div className="section-side">
                    <SectionBlock
                      alt={`${trip.title} right section ${index + 1}`}
                      block={section.right}
                    />
                  </div>
                </section>
              );
            }

            return (
              <section className="detail-section" key={`section-${index + 1}`}>
                <SectionBlock
                  alt={`${trip.title} section ${index + 1}`}
                  block={section.allover}
                />
              </section>
            );
          })}
          {!sections.length ? (
            <section className="detail-section">
              <div className="section-copy">
                <p>No sections yet. Add content to this trip JSON file.</p>
              </div>
            </section>
          ) : null}
        </div>
      </article>
    </section>
  );
}

function AboutPage({ about }) {
  const aboutContent =
    about?.content && typeof about.content === "object" ? about.content : about;
  const heading = aboutContent?.heading;
  const paragraphs = Array.isArray(aboutContent?.paras)
    ? aboutContent.paras
    : [];

  return (
    <section className="content-panel" aria-label="About">
      <h1>About</h1>
      <div className="section-copy about-copy">
        {isMeaningfulHeading(heading) ? (
          <h2 className="section-heading">{renderFormattedText(heading)}</h2>
        ) : null}
        {paragraphs.length ? (
          <AboutLeadParagraph paragraph={paragraphs[0]} />
        ) : null}
        {paragraphs.slice(1).map((paragraph, index) => (
          <p key={`${paragraph}-${index + 1}`}>
            {renderFormattedText(paragraph)}
          </p>
        ))}
      </div>
    </section>
  );
}

function NotFoundPage() {
  return (
    <section className="content-panel" aria-label="Page not found">
      <h1>Page not found</h1>
      <p>The page you tried to open does not exist yet.</p>
    </section>
  );
}

function App() {
  const [path, setPath] = useState(getCurrentPath);
  const [trips, setTrips] = useState([]);
  const [about, setAbout] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const contentSource = getContentSource();

  useEffect(() => {
    function handlePopState() {
      setPath(getCurrentPath());
      setIsMobileNavOpen(false);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initializeData() {
      setStatus("loading");
      setErrorMessage("");

      try {
        const [loadedTrips, loadedAbout] = await Promise.all([
          loadTrips(contentSource),
          loadAbout(contentSource),
        ]);

        if (cancelled) {
          return;
        }

        setTrips(loadedTrips);
        setAbout(loadedAbout);
        setStatus("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(error.message);
        setStatus("error");
      }
    }

    initializeData();

    return () => {
      cancelled = true;
    };
  }, [contentSource]);

  function navigate(nextPath) {
    if (nextPath === path) {
      setIsMobileNavOpen(false);
      return;
    }

    window.history.pushState({}, "", getAppHref(nextPath));
    window.scrollTo(0, 0);
    setIsMobileNavOpen(false);
    setPath(nextPath);
  }

  const selectedTrip = trips.find((trip) => trip.route === path);
  const isTripPage = status === "ready" && Boolean(selectedTrip);

  let page = <NotFoundPage />;

  if (status === "loading") {
    page = (
      <section className="content-panel" aria-label="Loading">
        <div className="loader-panel">
          <span aria-hidden="true" className="loader-spinner" />
          <p className="loader-label">Loading</p>
        </div>
      </section>
    );
  } else if (status === "error") {
    page = (
      <section className="content-panel" aria-label="Error">
        <h1>Could not load trip data</h1>
        <p>{errorMessage}</p>
      </section>
    );
  } else if (path === "/") {
    page = <HomePage onNavigate={navigate} trips={trips} />;
  } else if (path === "/about") {
    page = <AboutPage about={about} />;
  } else if (selectedTrip) {
    page = <TripPage trip={selectedTrip} />;
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <SiteLink className="site-brand" href="/" onNavigate={navigate}>
          <span>wherewasvarun</span>
          <span className="site-brand-dot">.</span>
          <span className="site-brand-suffix">com</span>
        </SiteLink>
        <div className="site-nav-shell">
          <button
            aria-controls="site-navigation"
            aria-expanded={isMobileNavOpen}
            aria-label={isMobileNavOpen ? "Close navigation" : "Open navigation"}
            className="site-nav-toggle"
            onClick={() => setIsMobileNavOpen((open) => !open)}
            type="button"
          >
            <span className="site-nav-toggle-bar" />
            <span className="site-nav-toggle-bar" />
            <span className="site-nav-toggle-bar" />
          </button>
          <nav
            className={`site-nav${isMobileNavOpen ? " site-nav-open" : ""}`}
            aria-label="Primary"
            id="site-navigation"
          >
            <SiteLink
              className={`site-nav-link${path === "/" ? " site-nav-link-active" : ""}`}
              href="/"
              onNavigate={navigate}
            >
              Home
            </SiteLink>
            <SiteLink
              className={`site-nav-link${path === "/about" ? " site-nav-link-active" : ""}`}
              href="/about"
              onNavigate={navigate}
            >
              About
            </SiteLink>
          </nav>
        </div>
      </header>
      <main
        className={`content-shell${isTripPage ? " content-shell-detail" : ""}`}
      >
        {page}
      </main>
      <footer className="site-footer">
        <span>Copyright © 2026 wherewasvarun.com</span>
      </footer>
    </div>
  );
}

export default App;
