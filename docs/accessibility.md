# Accessibility

Scope: the accessibility contracts the OpsBoard web application holds to, how it keeps them, and which of them are checked automatically. How the checks are run is in the [README](../README.md#testing-commands); where they sit among the test tiers is in the [testing strategy](testing-strategy.md).

OpsBoard does not claim conformance with WCAG or any other accessibility standard, and it has not been audited against one. The contracts below are specific behaviours the implementation keeps and the test suite checks. Meeting them is not the same as meeting a standard.

## Keyboard access

- Every action is a native link, button or form control, so it can be reached with Tab and operated with Enter or Space. No non-interactive element carries a click handler of its own.
- The command palette opens with Ctrl+K or Cmd+K from anywhere in the application, and from its visible, labelled entry in the shell. The shortcut is left alone while focus is in an editable field or another modal dialog is open, so it never steals a keystroke meant for something else. Pressing it again while the palette is open returns focus to the search field.
- Inside the palette, the search field is a combobox over a list of options. Up and Down move the active option, Home and End jump to the ends, Enter activates the active option, and Escape closes. The active option is conveyed with `aria-activedescendant`, so focus stays in the search field while the user moves through results.
- Confirmation dialogs cancel on Escape when idle. While a confirmed action is in progress, both controls are disabled and Escape is ignored, so a half-finished action cannot be dismissed out from under the user.

## Focus management

**Navigation.** When a navigation changes the page, focus moves to that page's designated target: its heading, or on a detail page a labelled region for whichever state is showing (loaded, loading or failed). A destination that renders after the navigation receives focus when it appears. If the user has already moved focus somewhere else in the meantime, it is left there. A change that stays on the same page, such as a filter, a sort or a page of results, leaves focus where the user put it.

**Dialogs.** The command palette and the confirmation dialog are native modal dialogs, so the browser keeps Tab and Shift+Tab inside them. The palette focuses its search field when it opens. Dismissing it returns focus to the element that opened it, and choosing a result hands focus to the destination page instead. The confirmation dialog starts on its cancel control when resolving or leaving an incident, and on its confirm control otherwise. When it closes, focus goes to the control that now makes sense, for example the reopen action after resolving an incident, and to a fallback target if the original control no longer exists.

**Forms.** A rejected save moves focus to the first field the server named, with its message beside it and the entered values untouched. A failure that names no field moves focus to a summary above the form. A conflicting save moves focus to the *Dismiss and continue editing* action of the conflict alert, and dismissing it returns focus to the form.

**Realtime.** Updates arriving from other users never move focus.

## Visible focus

Every focusable element shows a 2 px outline, offset from the element, whenever it receives keyboard focus. The indicator comes from one global `:focus-visible` rule rather than per-component styling, so a new control gets it without extra work.

## Announcements

Live regions are used deliberately and sparingly:

- **Errors** are alerts: a failed load, a rejected save that names no field, a lifecycle or collaboration failure, and a conflict.
- **Loading states are quiet.** They show text but announce nothing, so a screen reader is not interrupted by every fetch.
- **The realtime connection** has a polite status in the shell ("Realtime: Connected", "Reconnecting", and so on), so a change in the connection is announced without taking focus.
- **Palette results** are summarised politely once they settle, with a count or a clear no-match message, and nothing is announced while the user is still typing.
- **The confirmation dialog** moves focus to a working status while a confirmed action runs.

Data refreshed by realtime updates is not announced. It changes on screen quietly, in the same way a refetch would.

## Severity, status and health without colour

Severity, incident status and service health are always rendered as their words, such as "Critical", "Investigating" or "Degraded". Colour reinforces the words but never replaces them. Nothing in the interface depends on distinguishing colours alone.

## What is checked automatically

| Contract | Component tests | Browser journeys |
| --- | --- | --- |
| Route focus on navigation, not on in-page changes | yes | yes |
| Palette shortcut rules, keyboard navigation, focus return | yes | |
| Confirmation dialog contains focus | | yes |
| Confirmation dialog: cancel on Escape, pending behaviour, focus on close | yes | Escape |
| Visible focus indicator | | yes, on the first keyboard stops of the incident list |
| Field errors mapped, values kept, focus on the first affected field | yes | yes |
| Conflict alert focus and return | yes | |
| Quiet loading, explicit alerts, polite status wording | yes | |
| Severity, status and health rendered as text | yes | |
| Automated rule checks (axe-core) | | incident list, detail and create form; service list and detail; command palette with and without results |

The axe-core checks run the tool's default rules with nothing excluded in its options. A violation can be accepted only by listing it, with a reason, in `apps/web/e2e/a11y-accepted.json`, where it is visible and reviewed. That list is currently empty, so every checked screen passes with no accepted exceptions.

## What is not verified

- No assistive-technology testing with a screen reader or voice control is recorded. The announcement contracts above are checked through roles and live-region attributes, not by listening to them.
- The visible-focus check samples the keyboard stops of one screen; the other screens rely on the shared global rule.
- Focus containment is checked in a browser for the confirmation dialog only. The command palette relies on the same native modal behaviour without a dedicated check.
- Automated rule checks find a useful but partial class of problems. Passing them does not show that a screen is accessible to everyone who uses it.
