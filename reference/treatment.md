# Treatment

Read this before the first edit. The diagnosis says what is wrong. This says how to fix it without making a different mess.

## Order of work

1. Tokens: color roles, type scale, spacing scale, radius, elevation.
2. Shared components: buttons, list rows, cards, headers, empty and error states.
3. Screens, in the order of the findings: Critical, then Noticeable, then Minor.
4. Ask first items only after the user answers.

## Rules of the fix

- Remove before adding. Most screens improve by losing containers, colors, captions, and copy.
- Keep frequently used controls and gestures where users expect them. Ask before moving, removing, or redefining one.
- Keep business logic, data flow, and analytics unchanged.
- Ask before changing the navigation structure or the product's visual identity.
- Ask before adding a dependency. Use what the platform and the project already have.
- Mark invented data and placeholder content instead of polishing it.
- Keep the diff to the agreed screens and the shared code they need.
- Use the platform's native building blocks (see [ios.md](ios.md), [android.md](android.md), [stacks.md](stacks.md)) before custom ones.

## Do not swap one default for another

The most common failed treatment takes a purple, sparkly screen and returns a white screen with gray-bordered cards, one blue accent, an icon in a tinted square on each row, and a lot of empty space. It is cleaner. It is also the default look of every model, and people recognize it at a glance. Read section 6 of [tells.md](tells.md) before you design anything.

A treated screen gets its character from the product, not from a style:

- **Content first.** The thing the user came for, their orders, their zones, their messages, gets the most space and the strongest type. Chrome, greetings, and section labels get less. If the after shows less real content than the before, look again.
- **The product's own nouns.** Headers name what is there ("Kitchen lights", "Due this week"), not a dashboard category ("Overview", "Quick actions").
- **Color with a job.** Keep the brand color. Give color to state and meaning (selected, overdue, offline, destructive), not to decoration. If the app has no brand color, ask before inventing one.
- **Hierarchy from type and space first.** Size, weight, and grouping before containers, borders, and tints. A list is usually better than a stack of cards.
- **Native over bespoke.** A system list, a system sheet, a system tab bar, styled with the brand's type and color, beats a hand-built imitation of any of them.
- **Density that fits the use.** A tool used many times a day can be dense. Generous whitespace is a choice for a reason, not a default.

## The floor

Every changed screen meets these before you call it done.

- Touch targets at least 44pt on iOS and 48dp on Android, including padding and expanded hit areas such as `hitSlop`.
- Contrast 4.5:1 for body text, 3:1 for large text and meaningful icons, in light and dark.
- Platform text styles or a named scale. Text follows the user's size setting and nothing clips at the largest size.
- Content and controls clear of the notch, Dynamic Island, home indicator, status bar, and keyboard. Backgrounds may run edge to edge.
- One primary action per screen, within thumb reach.
- Spacing from a small scale. Related items closer than unrelated ones.
- Semantic color roles: background, surface, text, secondary text, accent, destructive. Dark mode is a real palette, not an inversion.
- Tabs for three to five peer destinations, push for drilling in, sheets for short side tasks.
- Icon-only controls labeled for screen readers. Logical focus order. Reduce Motion honored. Color never the only signal.
- Pressed, disabled, loading, empty, error, and offline states for everything you touched.
- On apps that ship to both platforms, each platform's patterns. Share the brand, not every control.

## Self-check before you hand it back

Answer each in one line in the treatment summary.

1. **Cover the logo.** Could the after screen belong to an unrelated app? If yes, it is not done.
2. **Count the containers.** Did the number of cards, borders, and tinted backgrounds go down?
3. **Count the colors.** Does every color on screen carry meaning?
4. **Find the dots.** Every small colored dot, badge, and pill: what status does it show, and would a color-blind user get it?
5. **Find the task.** Is the top task's control in the same place or better, and reachable with one thumb?
6. **Run the detector** on the changed files. Explain any hit you kept.
7. **Say what you did not check**, performance included.
