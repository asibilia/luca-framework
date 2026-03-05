/**
 * Test preload: Disable SpacetimeDB connections during tests.
 *
 * Sets LUCA_SPACETIMEDB_URL to a non-localhost URL so that:
 * 1. isLocalhostUrl() returns false -> queryTable/callReducer skip SpacetimeDB
 * 2. All code paths fall through to file-based operations
 * 3. Tests run against isolated temp files as originally intended
 *
 * Tests that specifically test SpacetimeDB client behavior
 * (spacetimedb-client.test.ts, observer-emitter.test.ts) override this
 * in their beforeEach with explicit env vars and fetch mocks.
 */
process.env.LUCA_SPACETIMEDB_URL = "http://test-disabled.invalid:0";
