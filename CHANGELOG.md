# Changelog
## 1.4.1 (2023-10-27)
This update adds better support for Readwise article highlighting and default tag template additions. Thanks to first time contributor @tdznr for adding to this release!

- Feature: Add "Open in Readwise" link when Readwise url field is present.
  -The url field contains the link to Readwise's website showing the highlighted snippet in its source context.
  - The url field is not available for book types, but is available for other content types such as Articles.
- Feature: Show tags in default highlight template

## 1.4.0 (2023-08-18)
Thanks to @johannrichard for the following contributions:

### Features
- Feature: ✨ add frontmatter tag field
- Feature: ✨ roll-up of highlight tags into frontmatter
  - a rolled-up (deduplicated) list highlight tags can be used in frontmatter via the field `quoted_highlight_tags`
- Feature: ✨ user setting for "colon" (:) replacement
  - The colon in a title is a special character which by default is replaced witha a dash (-) in filenames. With this change, users can choose what string to use as a replacement.
- Feature: ✨ Multi-line text can be filtered with the `bq` filter
  - The filter adds the `>` character after each line-break
  - With this, you can get multi-line text blockquotes in your templates working correctly
    ### Example
    The following highlight
    ```
    Multi-line text in blockquotes

    This is an example of a multi-line highlight with line-breaks.
    ```
    ... with this template
    ```markdown+nunjucks
    > [!quote]
    > {{ text | bq }}
    ```
    will turn into
    ```markdown
    > [!quote]
    > Multi-line text in blockquotes
    >
    > This is an example of a multi-line highlight with line-breaks.
    ```
### Updates
- Change field names to reflect their use in frontmatter
- Introduce option for quotes in tag format
  - make tag formatting more flexible
  - avoid adding quotes all the time
  - differentiate nohas from quoting
- Introduce option for quotes in tag format

## 1.3.0 (2022-12-10)
### Added
- Sort Highlights by Location (instead of date highlighted).
  - This will display highlights in order of page location, from least to greatest.
  - Combine with Sort Highlights from Oldest to Newest to reverse the sort order.
- Filter Discarded Highlights.
  - With this option enabled, highlights that have been discarded in Readwise will not be displayed in the Obsidian library.

## 1.1.1 (2021-08-01)
### Added
- Added Sync Log functionality. Creates a file (configurable, with a default filename of `Sync.md`) in the Readwise library root folder, which stores a time-based log listing when Readwise sources have synced new highlights

## 1.1.0 (2021-06-24)
### Added
- Added tag support, both in highlights and sources (books, articles, etc)

## 1.0.2 (2021-05-24)
### Fixed
- Fixed linking bug when illegal characters were stripped in filename, but not in Note title (https://github.com/jsonMartin/readwise-mirror/issues/4)
### Changed
- Starting default sort order preference now sorts highlights chronologically from oldest to newest

## 1.0.1 (2021-05-24)
### Added
- Added new checkbox in settings to allow highlights to be listed in reverse chronological order

### Fixed
- Fixes plugin breaking when there is no author (thanks @shabegom!)

### Development
- Added Prettier configuration for project style consistency
