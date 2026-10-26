/**
 * Real SwiftPM output (#668), captured with Swift 6.4 and Xcode 27.1 on
 * 2026-10-26 in a throwaway package whose test module is `CalcTests`: two
 * test sources, and the two JUnit files `swift test --parallel
 * --xunit-output out/core.xml` wrote for them.
 */

/** `Tests/CalcTests/AddingTests.swift`: Swift Testing. */
export const ADDING_TESTS_SWIFT = `import Testing
@testable import Calc

@Suite("Adding")
struct AddingTests {
    @Test("adds two numbers")
    func addsTwoNumbers() {
        #expect(add(2, 3) == 5)
    }

    @Test func failsOnPurpose() throws {
        let value = try #require(Optional(add(1, 1)))
        #expect(value == 3, "1 + 1 is not 3")
    }

    @Test func checksNothing() {}

    @Test("adds zero", arguments: [0, 1, 2])
    func addsZero(n: Int) {
        #expect(add(n, 0) == n)
    }

    @Suite struct Nested {
        @Test func nestedPasses() { #expect(true) }
    }
}

@Test func freeFunctionTest() {
    #expect(add(0, 0) == 0)
}

@Test(.disabled("not yet")) func skippedTest() {}
`

/** `Tests/CalcTests/LegacyXCTests.swift`: XCTest. */
export const LEGACY_XCTESTS_SWIFT = `import XCTest
@testable import Calc

final class LegacyXCTests: XCTestCase {
    func testAddsInXCTest() {
        XCTAssertEqual(Calc.add(1, 2), 3)
    }
    func testFailsInXCTest() {
        XCTAssertEqual(Calc.add(1, 2), 4, "wrong on purpose")
    }
    func testSkippedInXCTest() throws {
        throw XCTSkip("skip me")
    }
}
`

/** `out/core-swift-testing.xml`: the Swift Testing results. */
export const CORE_SWIFT_TESTING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="TestResults" errors="0" tests="6" failures="1" skipped="1" time="0.000812833">
    <testcase classname="CalcTests" name="freeFunctionTest()" time="0.000325709" />
    <testcase classname="CalcTests.AddingTests" name="addsZero(n:)" time="0.000181834" />
    <testcase classname="CalcTests.AddingTests" name="addsTwoNumbers()" time="0.000144833" />
    <testcase classname="CalcTests.AddingTests" name="failsOnPurpose()" time="0.000483542" >
      <failure message="Expectation failed: value == 3 (error): 1 + 1 is not 3" />
    </testcase>
    <testcase classname="CalcTests.AddingTests" name="checksNothing()" time="0.000106292" />
    <testcase classname="CalcTests.AddingTests.Nested" name="nestedPasses()" time="9.2125e-05" />
    <testcase classname="CalcTests" name="skippedTest()" >
      <skipped>not yet</skipped>
    </testcase>
  </testsuite>
</testsuites>
`

/** `out/core.xml`: the XCTest results, written only with `--parallel`. */
export const CORE_XML = `<?xml version="1.0" encoding="UTF-8"?>

<testsuites>
<testsuite name="TestResults" errors="0" tests="3" failures="1" time="0.380715876">
<testcase classname="CalcTests.LegacyXCTests" name="testSkippedInXCTest" time="0.126903459">
</testcase>
<testcase classname="CalcTests.LegacyXCTests" name="testFailsInXCTest" time="0.126906792">
<failure message="failure"></failure>
</testcase>
<testcase classname="CalcTests.LegacyXCTests" name="testAddsInXCTest" time="0.126905625">
</testcase>
</testsuite>
</testsuites>
`
