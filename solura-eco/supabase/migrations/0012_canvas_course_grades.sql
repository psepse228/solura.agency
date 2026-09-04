-- Solura Eco — Canvas course grade + color, for the /uni-load Courses grid.
-- See docs/superpowers/specs/2026-09-04-canvas-courses-grades-design.md.

alter table solura_eco.courses
  add column current_score numeric,   -- e.g. 83.45; null if ungraded/hidden
  add column color text;              -- hex from the member's own Canvas
                                        -- custom_colors, e.g. '#824797';
                                        -- null if never set
