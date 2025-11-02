# Unit Tests for Readwise Mirror Plugin

This document describes the comprehensive unit tests created for the Readwise Mirror Obsidian plugin.

## Test Coverage

The test suite covers all major changed files in the current branch:

### 1. **filename-utils.test.ts** (src/utils/`__tests__`/)
Tests for the `normalizeFilename` function with comprehensive coverage:
- **Slugify mode tests**: lowercase conversion, unicode handling, special characters, custom separators
- **Filenamify mode tests**: illegal character handling, hash removal, space normalization, length limits
- **Edge cases**: null/undefined values, multiple colons, path separators
- **Real-world examples**: book titles, quoted strings, URLs, brackets

### 2. **frontmatter-utils.test.ts** (src/utils/`__tests__`/)
Tests for frontmatter template utilities:
- **sanitizeFrontmatterTemplate**: delimiter removal, whitespace handling, empty templates
- **validateFrontmatterTemplate**: YAML syntax validation, template rendering, error handling
- **escapeValue**: quote handling, special YAML characters, multiline strings
- **escapeMetadata**: field-specific escaping, array handling, metadata preservation
- **Integration tests**: complex template validation with sample metadata

### 3. **frontmatter.test.ts** (src/services/`__tests__`/)
Tests for the Frontmatter class:
- **Constructor**: empty/populated initialization, data validation
- **Get/Set operations**: method chaining, type handling, validation
- **getOrThrow**: error handling for missing keys
- **Merge operations**: combining frontmatter instances, overwriting values
- **Serialization**: toString/fromString with YAML formatting
- **Edge cases**: unicode characters, long values, special YAML characters
- **FrontmatterError**: error construction and inheritance

### 4. **readwise-environment.test.ts** (src/services/`__tests__`/)
Tests for ReadwiseLoader and ReadwiseEnvironment:
- **ReadwiseLoader**: template storage/retrieval, source management
- **Custom filters**:
  - `bq`: blockquote formatting with various line endings
  - `is_qa` and `qa`: Q&A format detection and conversion
  - `date`: date formatting with moment
  - `normalize_author`: title prefix removal from author names
  - `fme`: YAML formatting for frontmatter
- **Template rendering**: variable substitution, filter chaining

### 5. **atomizer.test.ts** (src/services/`__tests__`/)
Tests for the Atomizer class and AtomizeExtension:
- **Atomizer class**: initialization, atomize method, composite mode
- **AtomizeExtension**:
  - Tag handling (atomize, frontmatter)
  - Parameter validation (id, basename, parent, embed)
  - Basename sanitization (special characters, length limits)
  - Frontmatter extraction and wrapping
  - Multiple rendering passes (FIRST, SECOND, COMPOSITE)

## Running Tests

### Prerequisites
Install test dependencies:
```bash
bash install-test-deps.sh
# or manually:
npm install --save-dev jest @jest/globals ts-jest @types/jest ts-node
```

### Run Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Configuration
The Jest configuration is defined in `jest.config.js` with:
- TypeScript support via ts-jest
- Module path mapping for imports
- Coverage collection configuration
- Node test environment

## Test Structure

Tests follow Jest conventions:
- `describe` blocks for grouping related tests
- `beforeEach` for test setup
- Clear, descriptive test names using `it` or `test`
- Comprehensive assertions with `expect`

## Coverage Goals

The test suite aims for:
- **Line coverage**: >80%
- **Branch coverage**: >75%
- **Function coverage**: >85%

Focus areas:
- Happy path scenarios
- Edge cases and boundary conditions
- Error handling and validation
- Special character handling
- Type safety and null checks

## Testing Best Practices

1. **Pure function testing**: Most tests focus on pure functions with no side effects
2. **Mocking**: Minimal mocking, preferring real implementations where possible
3. **Isolation**: Each test is independent and can run in any order
4. **Readability**: Clear test names that describe the expected behavior
5. **Maintainability**: Tests are organized by functionality and easy to update

## Future Enhancements

Potential areas for additional testing:
- Integration tests for the full atomization workflow
- Performance tests for large file processing
- End-to-end tests with Obsidian vault operations
- Property-based testing for filename normalization
- Snapshot testing for template rendering

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure all existing tests pass
3. Add tests for edge cases
4. Update this README if adding new test files
5. Aim for >80% coverage on new code

## Troubleshooting

### Common Issues

**Import errors**: Ensure `tsconfig.json` has correct path mappings
```json
{
  "compilerOptions": {
    "baseUrl": "src"
  }
}
```

**Module not found**: Check `jest.config.js` moduleNameMapper
```javascript
moduleNameMapper: {
  '^utils/(.*)$': '<rootDir>/src/utils/$1',
  // ...
}
```

**Obsidian API mocking**: For tests requiring Obsidian APIs, create mocks in `__mocks__` directory

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [TypeScript Jest Guide](https://kulshekhar.github.io/ts-jest/)
- [Testing Best Practices](https://testingjavascript.com/)