import { describe, expect, it } from "vitest";
import { escapeLikePattern, likePatternForExactEmail, normalizeEmail } from "../../src/domain/email";

describe("email claim matching", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
  });

  it("escapes SQL LIKE metacharacters so they match literally", () => {
    // '.' is not a LIKE metacharacter and stays as-is; % _ \ are escaped.
    expect(escapeLikePattern("jane.doe@example.com")).toBe("jane.doe@example.com");
    expect(escapeLikePattern("a_b%c\\d@x.com")).toBe("a\\_b\\%c\\\\d@x.com");
  });

  it("builds a literal pattern for a normal address", () => {
    // The dot is literal, and the local-part is lower-cased. Crucially it does
    // not turn into a wildcard that would also match jane_doe@ or janexdoe@.
    expect(likePatternForExactEmail("Jane.Doe@example.com")).toBe("jane.doe@example.com");
  });

  it("neutralizes the wildcards that caused the look-alike takeover", () => {
    // '_' is escaped, so jane_doe@ no longer matches jane.doe@ (it matches only
    // the literal underscore address).
    expect(likePatternForExactEmail("jane_doe@example.com")).toBe("jane\\_doe@example.com");
    // '%' is escaped, so %@example.com no longer matches every address.
    expect(likePatternForExactEmail("%@example.com")).toBe("\\%@example.com");
    // '*' (PostgREST's alias of %) cannot be matched literally, so refuse it.
    expect(likePatternForExactEmail("*@example.com")).toBeNull();
    expect(likePatternForExactEmail("  ")).toBeNull();
  });
});
