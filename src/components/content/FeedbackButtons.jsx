import React, { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

export default function FeedbackButtons({ contentTitle, contentSlug }) {
  const [voted, setVoted] = useState(null);

  const handleVote = (vote) => {
    if (voted) return;
    setVoted(vote);
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", "content_feedback", {
        content_title: contentTitle,
        content_slug: contentSlug,
        vote,
      });
    }
  };

  return (
    <div className="flex items-center gap-3 mt-12 pt-8 border-t border-border">
      <span className="text-sm text-muted-foreground">Was this helpful?</span>
      {voted ? (
        <span className="text-sm text-muted-foreground">Thanks for the feedback.</span>
      ) : (
        <>
          <button
            onClick={() => handleVote("up")}
            aria-label="Helpful"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-primary/30 hover:text-primary transition-all"
          >
            <ThumbsUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleVote("down")}
            aria-label="Not helpful"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-destructive/30 hover:text-destructive transition-all"
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
