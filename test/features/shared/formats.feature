Feature: Portable state and memory formats

  Scenario: MDX preserves state and its body after a round trip
    Given these state details:
      """json
      {
        "meta": {"key":"count","value":3,"at":"2026-11-19T09:00:00.000Z","cause":"e-1","version":2},
        "body": "\n## What\nThe counter.\n"
      }
      """
    When I render the state
    Then the rendered text starts with:
      """
      ---
      key: "count"
      value: 3
      """
    And reading the rendered state returns the original metadata and body

  Scenario: Handwritten state frontmatter can be read
    When I read this state document:
      """
      ---
      key: mood
      value: calm
      version: 1
      at: null
      ---
      free text
      """
    Then the result is:
      """json
      {"meta":{"key":"mood","value":"calm","version":1,"at":null},"body":"free text"}
      """

  Scenario: DOT preserves relation weights, evidence, escaping, and extra attributes
    Given these relations:
      """json
      [
        {"from":"say \"ship it\"","type":"follows","to":"run the \\tests","weight":2,"evidence":["e-1","e-2"]},
        {"from":"person","type":"prefers","to":"small steps","weight":5,"evidence":["e-3"],"extra":{"colour":"red"}}
      ]
      """
    When I render the memory graph
    Then the rendered text starts with:
      """
      digraph memory {
      """
    And the rendered text contains:
      """
      "person" -> "small steps" [type="prefers", weight=5
      """
    And reading the rendered graph returns the original relations

  Scenario: The DOT reader reports unsupported edges
    When I read this memory graph:
      """
      digraph memory {
        a -> b;
      }
      """
    Then the result is:
      """json
      {"relations":[],"skipped":["a -> b;"]}
      """
