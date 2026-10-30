package com.messagecenter.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 本地敏感词过滤器（DFA/Trie）。零外网、数据不出内网。
 *
 * 归一化：大写→小写、全角→半角（字母/数字/空格/个别标点）。
 * 混淆容忍：词内插入 空白/制表符/零宽字符/星号 等分隔符时仍可命中（匹配时跳过分隔符）。
 *
 * 每个词携带已解析的处理动作：
 *  - REJECT：拒绝发送（调用方应抛异常拦截）
 *  - MASK  ：掩码放行（调用方把命中区间替换为 '*' 后继续发送）
 *
 * 下标说明：find/mask 均在「归一化后文本」上计算下标；因 toLower 与全角→半角均为 1:1 等长映射，
 * 归一化文本与原文字符下标一一对应，故可直接用下标回写原文字符串做掩码。
 */
public class SensitiveWordFilter {

    public static final String ACTION_REJECT = "REJECT";
    public static final String ACTION_MASK = "MASK";

    /** 已解析动作的敏感词条目（word 为归一化后的词） */
    public static class Word {
        public final String word;
        public final String action;
        public Word(String word, String action) {
            this.word = word;
            this.action = action;
        }
    }

    private static class Node {
        Map<Character, Node> children = new HashMap<>();
        boolean end = false;
        String action;
        String word;
    }

    private final Node root = new Node();
    private final List<Word> words;

    public SensitiveWordFilter(List<Word> words) {
        this.words = (words == null) ? new ArrayList<>() : words;
        for (Word w : this.words) {
            String norm = normalize(w.word);
            if (norm == null || norm.isEmpty()) continue;
            Node cur = root;
            for (int i = 0; i < norm.length(); i++) {
                char c = norm.charAt(i);
                Node nxt = cur.children.get(c);
                if (nxt == null) {
                    nxt = new Node();
                    cur.children.put(c, nxt);
                }
                cur = nxt;
            }
            cur.end = true;
            cur.action = w.action;
            cur.word = norm;
        }
    }

    public boolean isEmpty() {
        return words.isEmpty();
    }

    /**
     * 大小写 + 全角→半角 归一化（1:1 等长，下标可回映原文）。
     * 全角字母/数字/空格/部分标点的码点范围：
     *   数字 0-9      U+FF10..U+FF19
     *   大写 A-Z      U+FF21..U+FF3A
     *   小写 a-z      U+FF41..U+FF5A
     *   全角空格      U+3000
     *   全角连字符    U+FF0D
     *   全角加号      U+FF0B
     *   全角等号      U+FF1D
     */
    public static String normalize(String s) {
        if (s == null) return "";
        int n = s.length();
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) {
            char c = s.charAt(i);
            if (c >= 'A' && c <= 'Z') {
                // 半角大写，留给末尾 toLowerCase 处理
            } else if (c >= 'a' && c <= 'z') {
                // 半角小写
            } else if (c >= '\uFF10' && c <= '\uFF19') {   // 全角数字 -> 半角
                c = (char) (c - '\uFF10' + '0');
            } else if (c >= '\uFF21' && c <= '\uFF3A') {   // 全角大写 -> 半角
                c = (char) (c - '\uFF21' + 'A');
            } else if (c >= '\uFF41' && c <= '\uFF5A') {   // 全角小写 -> 半角
                c = (char) (c - '\uFF41' + 'a');
            } else if (c == '\u3000') {                    // 全角空格 -> 半角空格
                c = ' ';
            } else if (c == '\uFF0D') {                    // 全角连字符
                c = '-';
            } else if (c == '\uFF0B') {                    // 全角加号
                c = '+';
            } else if (c == '\uFF1D') {                    // 全角等号
                c = '=';
            }
            sb.append(Character.toLowerCase(c));
        }
        return sb.toString();
    }

    /** 匹配时可被跳过的分隔符（用于抵抗「敏 感」「敏*感」之类的插入式混淆）。 */
    private static boolean isSeparator(char c) {
        return c == ' '
                || c == '\t'
                || c == '\n'
                || c == '\r'
                || c == '\u200B'   // 零宽空格
                || c == '\u200C'   // 零宽不连字
                || c == '\u200D'   // 零宽连字
                || c == '\uFEFF'   // BOM / 零宽不换行
                || c == '*';
    }

    /** 匹配命中（含原始文本下标区间，可直接用于替换）。 */
    public static class Match {
        public final int start;
        public final int end;
        public final String word;
        public final String action;
        public Match(int start, int end, String word, String action) {
            this.start = start;
            this.end = end;
            this.word = word;
            this.action = action;
        }
    }

    /**
     * 在原始文本上查找所有命中（含分隔符跳过）。
     * 采用贪心最长匹配：每个起点取到的最长词作为一次命中，命中后从词尾继续扫描，命中互不重叠。
     */
    public List<Match> findAll(String text) {
        List<Match> result = new ArrayList<>();
        if (text == null || text.isEmpty() || isEmpty()) return result;
        String norm = normalize(text);
        int n = norm.length();
        int i = 0;
        while (i < n) {
            Node node = root;
            int j = i;
            int lastEnd = -1;
            String matchedWord = null;
            String matchedAction = null;
            while (j < n) {
                char ch = norm.charAt(j);
                if (isSeparator(ch) && node != root) {
                    j++;
                    continue;
                }
                Node nxt = node.children.get(ch);
                if (nxt == null) break;
                node = nxt;
                j++;
                if (node.end) {
                    lastEnd = j;
                    matchedWord = node.word;
                    matchedAction = node.action;
                }
            }
            if (lastEnd != -1) {
                result.add(new Match(i, lastEnd, matchedWord, matchedAction));
                i = lastEnd;
            } else {
                i++;
            }
        }
        return result;
    }

    public Match firstReject(String text) {
        for (Match m : findAll(text)) {
            if (ACTION_REJECT.equals(m.action)) return m;
        }
        return null;
    }

    public boolean hasReject(String text) {
        return firstReject(text) != null;
    }

    /** 把所有 MASK 动作命中区间替换为 '*'，REJECT 命中不动。返回掩码后文本（无 MASK 命中则原样返回）。 */
    public String mask(String text) {
        List<Match> ms = findAll(text);
        if (ms.isEmpty()) return text;
        boolean anyMask = false;
        for (Match m : ms) {
            if (ACTION_MASK.equals(m.action)) { anyMask = true; break; }
        }
        if (!anyMask) return text;
        StringBuilder sb = new StringBuilder(text);
        for (int k = ms.size() - 1; k >= 0; k--) {           // 从后往前替换，避免下标偏移
            Match m = ms.get(k);
            if (!ACTION_MASK.equals(m.action)) continue;
            for (int p = m.start; p < m.end && p < sb.length(); p++) {
                sb.setCharAt(p, '*');
            }
        }
        return sb.toString();
    }
}
