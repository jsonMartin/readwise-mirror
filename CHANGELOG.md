# Changelog

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