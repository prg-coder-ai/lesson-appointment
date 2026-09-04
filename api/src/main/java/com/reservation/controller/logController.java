package com.reservation.controller; 

import com.reservation.common.Result;
import org.springframework.web.bind.annotation.*;

import java.io.*;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.*;
import java.util.zip.GZIPInputStream;
import lombok.extern.slf4j.Slf4j;


@RestController
@RequestMapping("/api/logs")
@Slf4j
public class logController {
 
    private static final String LOG_DIR = "./logs";
    private static final String CURRENT_LOG = LOG_DIR + "/spring-boot-app.log";
    private static final String ARCHIVED_DIR = LOG_DIR + "/archived";

    // 1. 读取当前日志尾部（tail）
    @GetMapping("/tail")
    public Result<List<String>> tail(@RequestParam(defaultValue = "200") int lines) {
        try {
            List<String> all = Files.readAllLines(Path.of(CURRENT_LOG));
            int start = Math.max(0, all.size() - lines);
            return Result.success(all.subList(start, all.size()),"tail  " + lines + " lines");
        } catch (IOException e) {
            return Result.fail(500, "读取日志失败: " + e.getMessage());
        }
    }

    

    // 2. 按日期读取归档日志（自动解压 .gz）
    @GetMapping("/date")
    public Result<List<String>> byDate(
            @RequestParam String date,           // yyyy-MM-dd
            @RequestParam(defaultValue = "500") int maxLines) {
        // 查找匹配的归档文件（可能有多个 %i 分片）
        File dir = new File(ARCHIVED_DIR);
        File[] matched = dir.listFiles((d, name) ->
            name.startsWith("spring-boot-app." + date) && name.endsWith(".log.gz"));
        if (matched == null || matched.length == 0) {
            return Result.success(Collections.emptyList(),"no archived log found for date: " + date);
        }
        // 按索引排序
        Arrays.sort(matched, Comparator.comparing(File::getName));
        List<String> result = new ArrayList<>();
        for (File f : matched) {
            try (GZIPInputStream gz = new GZIPInputStream(new FileInputStream(f));
                 InputStreamReader isr = new InputStreamReader(gz, "UTF-8");
                 BufferedReader br = new BufferedReader(isr)) {
                String line;
                while ((line = br.readLine()) != null && result.size() < maxLines) {
                    result.add(line);
                }
            } catch (IOException e) {
                return Result.fail(500, "解压归档日志失败: " + e.getMessage());
            }
        }
        return Result.success(result,"archived log for date: " + date);
    }

    // 3. 搜索日志（关键词 + 级别 + 时间范围）
    @GetMapping("/search")
    public Result<List<String>> search(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String level,   // INFO/WARN/ERROR
            @RequestParam(required = false) String date,    // 可选：限定某天
            @RequestParam(defaultValue = "500") int maxResults) {

        List<String> sourceLines = new ArrayList<>();
        // 读取当前日志或归档日志
        if (date != null && !date.isEmpty()) {
            Result<List<String>> r = byDate(date, Integer.MAX_VALUE);
            sourceLines.addAll(r.getData() != null ? r.getData() : Collections.emptyList());
        } else {
            try {
                sourceLines = Files.readAllLines(Path.of(CURRENT_LOG));
            } catch (IOException e) {
                return Result.fail(500, "读取日志失败: " + e.getMessage());
            }
        }
        // 过滤
        Stream<String> stream = sourceLines.stream();
        if (level != null && !level.isEmpty()) {
            stream = stream.filter(l -> l.contains(" " + level.toUpperCase() + " "));
        }
        if (keyword != null && !keyword.isEmpty()) {
            stream = stream.filter(l -> l.contains(keyword));
        }
        List<String> filtered = stream.limit(maxResults).collect(Collectors.toList());
        return Result.success(filtered,"search result");
    }

      // 4. 列出可用的归档日期
    @GetMapping("/dates")
    public Result<List<String>> availableDates() {
           /* if (!checkRole("admin")) {
            return Result.fail(403, "无权限访问日志");
            }*/
        File dir = new File(ARCHIVED_DIR);
        File[] files = dir.listFiles((d, name) -> name.endsWith(".log.gz"));
        if (files == null) return Result.success(Collections.emptyList(),"no archived log found");
        Set<String> dates = new TreeSet<>(Comparator.reverseOrder());
        for (File f : files) {
            // spring-boot-app.2026-08-20.0.log.gz → 2026-08-20
            String name = f.getName();
            int start = name.indexOf('.') + 1;
            int end = name.lastIndexOf('.');
            if (start > 0 && end > start) {
                dates.add(name.substring(start, name.lastIndexOf('.', end - 1)));
            }
        }
        return Result.success(new ArrayList<>(dates),"available dates");
    }

}
