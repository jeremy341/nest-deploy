import { createCn } from "cn/config"

/**
 * Class-name merging that knows our own type scale. Without this, the merger
 * reads `text-title-1` as a text colour, so `cn("text-title-1", "text-muted-foreground")`
 * would silently drop the size. Keep this list in step with the `text-*` size
 * utilities in globals.css.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "title-1",
            "title-2",
            "title-3",
            "body",
            "body-lg",
            "label",
            "caption",
            "stat",
            "docs-h1",
            "docs-lead",
            "docs-h2",
            "docs-h3",
            "docs-small",
            "prose",
            "code",
          ],
        },
      ],
    },
  },
})
