package com.playhub.aos.network

/**
 * Tiny zero-dependency RFC 8259 JSON parser & serializer for minimal APK footprint
 * and deterministic JVM unit testing without android.jar org.json stubs.
 */
object MiniJson {
    fun parseObject(text: String): Map<String, Any?> {
        val value = Parser(text).parseValue()
        @Suppress("UNCHECKED_CAST")
        return value as? Map<String, Any?> ?: emptyMap()
    }

    fun stringify(value: Any?): String = when (value) {
        null -> "null"
        is Boolean, is Number -> value.toString()
        is String -> buildString(value.length + 2) {
            append('"')
            for (ch in value) {
                when (ch) {
                    '"' -> append("\\\"")
                    '\\' -> append("\\\\")
                    '\b' -> append("\\b")
                    '\u000C' -> append("\\f")
                    '\n' -> append("\\n")
                    '\r' -> append("\\r")
                    '\t' -> append("\\t")
                    else -> if (ch.code < 0x20) append("\\u%04x".format(ch.code)) else append(ch)
                }
            }
            append('"')
        }
        is Map<*, *> -> value.entries.joinToString(",", "{", "}") { (k, v) ->
            "${stringify(k.toString())}:${stringify(v)}"
        }
        is Iterable<*> -> value.joinToString(",", "[", "]") { stringify(it) }
        else -> stringify(value.toString())
    }

    private class Parser(private val s: String) {
        private var pos = 0

        fun parseValue(): Any? {
            skipWs()
            if (pos >= s.length) return null
            return when (s[pos]) {
                '{' -> parseObject()
                '[' -> parseArray()
                '"' -> parseString()
                't' -> expect("true", true)
                'f' -> expect("false", false)
                'n' -> expect("null", null)
                else -> parseNumber()
            }
        }

        private fun parseObject(): Map<String, Any?> {
            pos++ // '{'
            val map = LinkedHashMap<String, Any?>()
            skipWs()
            if (pos < s.length && s[pos] == '}') { pos++; return map }
            while (pos < s.length) {
                skipWs()
                val key = parseString()
                skipWs()
                require(pos < s.length && s[pos] == ':') { "Expected ':' at $pos" }
                pos++
                map[key] = parseValue()
                skipWs()
                if (pos < s.length && s[pos] == ',') { pos++; continue }
                if (pos < s.length && s[pos] == '}') { pos++; break }
                throw IllegalArgumentException("Unexpected char in object at $pos")
            }
            return map
        }

        private fun parseArray(): List<Any?> {
            pos++ // '['
            val list = ArrayList<Any?>()
            skipWs()
            if (pos < s.length && s[pos] == ']') { pos++; return list }
            while (pos < s.length) {
                list += parseValue()
                skipWs()
                if (pos < s.length && s[pos] == ',') { pos++; continue }
                if (pos < s.length && s[pos] == ']') { pos++; break }
                throw IllegalArgumentException("Unexpected char in array at $pos")
            }
            return list
        }

        private fun parseString(): String {
            require(pos < s.length && s[pos] == '"') { "Expected '\"' at $pos" }
            pos++
            val sb = StringBuilder()
            while (pos < s.length) {
                val c = s[pos++]
                if (c == '"') return sb.toString()
                if (c == '\\' && pos < s.length) {
                    when (val esc = s[pos++]) {
                        '"', '\\', '/' -> sb.append(esc)
                        'b' -> sb.append('\b')
                        'f' -> sb.append('\u000C')
                        'n' -> sb.append('\n')
                        'r' -> sb.append('\r')
                        't' -> sb.append('\t')
                        'u' -> {
                            val hex = s.substring(pos, pos + 4)
                            sb.append(hex.toInt(16).toChar())
                            pos += 4
                        }
                        else -> sb.append(esc)
                    }
                } else {
                    sb.append(c)
                }
            }
            throw IllegalArgumentException("Unterminated JSON string")
        }

        private fun parseNumber(): Number {
            val start = pos
            while (pos < s.length && s[pos] in "-+0123456789.eE") pos++
            val raw = s.substring(start, pos)
            return if (raw.contains('.') || raw.contains('e') || raw.contains('E')) raw.toDouble() else raw.toLong()
        }

        private fun expect(lit: String, value: Any?): Any? {
            require(s.startsWith(lit, pos)) { "Expected '$lit' at $pos" }
            pos += lit.length
            return value
        }

        private fun skipWs() {
            while (pos < s.length && s[pos] <= ' ') pos++
        }
    }
}
