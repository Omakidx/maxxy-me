# Regex — Pattern Reference

## Common Patterns

### Validation
```regex
# Email (simplified, covers 99% of cases)
^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$

# URL
^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$

# IPv4
^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$

# IPv6 (simplified)
^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$

# UUID v4
^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$

# Phone (international, E.164)
^\+[1-9]\d{1,14}$

# Phone (US)
^(\+1)?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$
```

### Passwords
```regex
# Min 8 chars, 1 uppercase, 1 lowercase, 1 digit
^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$

# Min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special
^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$
```

### Dates & Times
```regex
# ISO 8601 date (YYYY-MM-DD)
^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$

# Time (HH:MM:SS, 24hr)
^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$

# ISO 8601 datetime
^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$
```

### Numbers
```regex
# Integer
^-?\d+$

# Decimal / Float
^-?\d+(\.\d+)?$

# Currency (USD)
^\$?\d{1,3}(,\d{3})*(\.\d{2})?$

# Hex color
^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$
```

### Strings
```regex
# Slug (URL-safe)
^[a-z0-9]+(-[a-z0-9]+)*$

# Username (alphanumeric, underscores, 3-20 chars)
^[a-zA-Z0-9_]{3,20}$

# Semantic version
^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$

# File extension
\.([a-zA-Z0-9]+)$

# HTML tags
<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>

# Markdown links
\[([^\]]+)\]\(([^)]+)\)
```

---

## Flags Reference

| Flag | Name | Effect |
|------|------|--------|
| `g` | Global | Match all occurrences, not just the first |
| `i` | Case-insensitive | `a` matches `A` |
| `m` | Multiline | `^`/`$` match line start/end, not string |
| `s` | Dotall | `.` matches newlines too |
| `u` | Unicode | Full Unicode support |
| `y` | Sticky | Match only at `lastIndex` position |

---

## Lookahead & Lookbehind

```regex
# Positive lookahead: match X followed by Y
X(?=Y)

# Negative lookahead: match X NOT followed by Y
X(?!Y)

# Positive lookbehind: match X preceded by Y
(?<=Y)X

# Negative lookbehind: match X NOT preceded by Y
(?<!Y)X
```

### Practical Examples
```regex
# Price number without $ sign (lookbehind)
(?<=\$)\d+(\.\d{2})?

# Word followed by colon (lookahead)
\w+(?=:)

# Password must contain digit (lookahead)
^(?=.*\d).{8,}$
```

---

## Quantifiers Quick Reference

| Pattern | Meaning |
|---------|---------|
| `*` | 0 or more |
| `+` | 1 or more |
| `?` | 0 or 1 |
| `{n}` | Exactly n |
| `{n,}` | n or more |
| `{n,m}` | Between n and m |
| `*?` | 0 or more (lazy) |
| `+?` | 1 or more (lazy) |

---

## Character Classes

| Class | Meaning |
|-------|---------|
| `\d` | Digit `[0-9]` |
| `\D` | Non-digit |
| `\w` | Word char `[a-zA-Z0-9_]` |
| `\W` | Non-word char |
| `\s` | Whitespace `[ \t\n\r\f\v]` |
| `\S` | Non-whitespace |
| `\b` | Word boundary |
| `.` | Any char (except newline) |

---

## Language-Specific Usage

### JavaScript
```javascript
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
emailRegex.test('user@example.com'); // true

const matches = 'hello world'.match(/(\w+)/g); // ['hello', 'world']

'foo-bar-baz'.replace(/-(\w)/g, (_, c) => c.toUpperCase()); // 'fooBarBaz'
```

### Python
```python
import re

pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
bool(pattern.match('user@example.com'))  # True

re.findall(r'\d+', 'abc 123 def 456')   # ['123', '456']
re.sub(r'-(\w)', lambda m: m.group(1).upper(), 'foo-bar')  # 'fooBar'
```

### Go
```go
import "regexp"

re := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
re.MatchString("user@example.com") // true

matches := regexp.MustCompile(`\d+`).FindAllString("abc 123 def 456", -1) // ["123", "456"]
```

---

## Search & Replace Patterns

### Code Refactoring
```regex
# Convert var to const (JS)
Find:    \bvar\b(\s+\w+\s*=)
Replace: const$1

# Add trailing comma to object properties
Find:    ([^\s,{])\n(\s*})
Replace: $1,\n$2

# Convert single quotes to double quotes
Find:    '([^']*)'
Replace: "$1"

# Remove console.log statements
Find:    ^\s*console\.log\(.*\);\s*\n
Replace: (empty)

# Convert px to rem (assuming 16px base)
Find:    (\d+)px
Replace: (calculate $1/16)rem
```

### Data Extraction
```regex
# Extract all URLs from text
https?:\/\/[^\s<>"{}|\\^`\[\]]+

# Extract all email addresses
[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}

# Extract JSON keys
"([^"]+)"\s*:

# Extract import paths (JS/TS)
(?:from|import)\s+['"]([^'"]+)['"]
```
