Feature: A shared layout for test step modules

  Scenario: The runner provides each agreed step module
    Then this runner has exactly these step modules:
      | module           |
      | domain           |
      | hooks            |
      | interoperability |
      | suite_layout     |
      | workspace        |
