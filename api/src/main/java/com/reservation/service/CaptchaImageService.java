package com.reservation.service;

import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.AlphaComposite;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 滑块拼图素材生成（2026-10-22 P1）。用 JDK 自带 Java2D，不引任何第三方图形库。
 *
 * <h3>为什么自研而不接第三方验证码 SDK</h3>
 * <ul>
 *   <li>Web 端是零框架 + {@code build.js} 打包，引带全局副作用的 SDK 会撞上"顶层标识符污染"与 dist 体积；</li>
 *   <li>小程序端引第三方 SDK 要走 request 合法域名、插件申请、审核，链路比自研 canvas 长得多；</li>
 *   <li>自研后**两端共用同一套服务端出题协议**，只是渲染方式不同（详见两端接入文档）。</li>
 * </ul>
 *
 * <h3>安全相关的三个必须</h3>
 * <ol>
 *   <li><b>{@code targetX} 绝不下发</b>：只随票据落库。前端拿不到横坐标，滑块才有意义。</li>
 *   <li><b>块必须从背景同源抠出</b>：先抠图、再在背景上画缺口遮罩。顺序反了会抠到一个带遮罩的块，
 *       看着像、对不齐，用户会以为是 bug。</li>
 *   <li><b>抠出来的子图必须复制</b>：{@code getSubimage} 返回的是**共享像素缓冲的视图**，
 *       不复制的话，后面在背景上画遮罩会同时改掉拼图块本身（这是 Java2D 的经典坑）。</li>
 * </ol>
 *
 * <h3>无头环境</h3>
 * <p>Spring Boot 默认 {@code java.awt.headless=true}；{@link BufferedImage} 的离屏绘制在 headless 下
 * 完全可用（不需要屏幕/Display）。因此本类不依赖 X11/桌面环境，服务器上可直接跑。
 */
@Service
public class CaptchaImageService {

    /** 背景尺寸（与前端 CSS 尺寸一致，缩放会导致坐标换算出错）。 */
    public static final int BG_WIDTH = 300;
    public static final int BG_HEIGHT = 150;
    /** 拼图块边长。 */
    public static final int PIECE_SIZE = 50;

    /** 缺口横坐标取值范围：留出左侧 60px 起步，避免"闭眼拖到最左"就能蒙对。 */
    private static final int TARGET_X_MIN = 60;
    private static final int TARGET_X_MAX = BG_WIDTH - PIECE_SIZE - 10;
    /** 缺口纵坐标范围：块要完整落在背景内。 */
    private static final int TARGET_Y_MIN = 10;
    private static final int TARGET_Y_MAX = BG_HEIGHT - PIECE_SIZE - 2;

    /**
     * 生成一组拼图素材。
     *
     * @return 背景图 base64、拼图块 base64、缺口坐标（坐标只用于服务端落库）
     */
    public Puzzle generate() {
        ThreadLocalRandom rnd = ThreadLocalRandom.current();
        int targetX = rnd.nextInt(TARGET_X_MIN, TARGET_X_MAX + 1);
        int targetY = rnd.nextInt(TARGET_Y_MIN, TARGET_Y_MAX + 1);

        BufferedImage bg = new BufferedImage(BG_WIDTH, BG_HEIGHT, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = bg.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);

            paintBackground(g, rnd);

            // ★ 顺序：先抠块，再画缺口遮罩。反了会抠到"已经带上遮罩"的块。
            BufferedImage piece = cutPiece(bg, targetX, targetY);

            paintNotch(g, targetX, targetY);

            return new Puzzle(
                    toBase64Png(bg),
                    toBase64Png(piece),
                    targetX,
                    targetY,
                    PIECE_SIZE,
                    BG_WIDTH,
                    BG_HEIGHT);
        } finally {
            g.dispose();
        }
    }

    /** 随机渐变 + 噪点干扰：颜色对足够多，避免固定图案被模板匹配。 */
    private void paintBackground(Graphics2D g, ThreadLocalRandom rnd) {
        Color c1 = randomColor(rnd, 120, 220);
        Color c2 = randomColor(rnd, 120, 220);
        g.setPaint(new GradientPaint(0, 0, c1, BG_WIDTH, BG_HEIGHT, c2));
        g.fillRect(0, 0, BG_WIDTH, BG_HEIGHT);

        // 半透明圆形色块：增加纹理，但不影响人眼识别缺口
        for (int i = 0; i < 14; i++) {
            int alpha = 40 + rnd.nextInt(60);
            g.setColor(new Color(rnd.nextInt(256), rnd.nextInt(256), rnd.nextInt(256), alpha));
            int w = 14 + rnd.nextInt(40);
            int h = 14 + rnd.nextInt(40);
            g.fillOval(rnd.nextInt(BG_WIDTH), rnd.nextInt(BG_HEIGHT), w, h);
        }
        // 细线干扰：挡掉简单 OCR 类工具，对真人无感
        for (int i = 0; i < 7; i++) {
            g.setColor(new Color(255, 255, 255, 70 + rnd.nextInt(60)));
            g.setStroke(new BasicStroke(1f + rnd.nextFloat()));
            g.drawLine(rnd.nextInt(BG_WIDTH), rnd.nextInt(BG_HEIGHT),
                    rnd.nextInt(BG_WIDTH), rnd.nextInt(BG_HEIGHT));
        }
        g.setStroke(new BasicStroke(1f));
    }

    /**
     * 从背景中抠出缺口块，并复制成独立图像。
     *
     * <p>{@code getSubimage} 返回的视图与原图**共享像素数据**，必须复制：
     * 否则后面 {@link #paintNotch} 在背景上画遮罩时，拼图块也会跟着变暗。
     */
    private BufferedImage cutPiece(BufferedImage bg, int x, int y) {
        BufferedImage sub = bg.getSubimage(x, y, PIECE_SIZE, PIECE_SIZE);
        BufferedImage piece = new BufferedImage(PIECE_SIZE, PIECE_SIZE, BufferedImage.TYPE_INT_RGB);
        Graphics2D pg = piece.createGraphics();
        try {
            pg.setComposite(AlphaComposite.Src);
            pg.drawImage(sub, 0, 0, null);
            // 白色描边：让块在浅色背景上也有轮廓，方便用户判断"拖到了没有"
            pg.setColor(new Color(255, 255, 255, 235));
            pg.setStroke(new BasicStroke(1.2f));
            pg.drawRect(0, 0, PIECE_SIZE - 1, PIECE_SIZE - 1);
        } finally {
            pg.dispose();
        }
        return piece;
    }

    /** 在背景上画出缺口：半透明遮罩 + 白色描边 —— 这才是用户"对齐"的视觉锚点。 */
    private void paintNotch(Graphics2D g, int x, int y) {
        g.setColor(new Color(0, 0, 0, 120));
        g.fillRect(x, y, PIECE_SIZE, PIECE_SIZE);
        g.setColor(new Color(255, 255, 255, 210));
        g.setStroke(new BasicStroke(1.2f));
        g.drawRect(x, y, PIECE_SIZE, PIECE_SIZE);
        g.setStroke(new BasicStroke(1f));
    }

    private Color randomColor(ThreadLocalRandom rnd, int min, int max) {
        int r = min + rnd.nextInt(max - min);
        int g = min + rnd.nextInt(max - min);
        int b = min + rnd.nextInt(max - min);
        return new Color(r, g, b);
    }

    private String toBase64Png(BufferedImage img) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream(8 * 1024)) {
            ImageIO.write(img, "png", out);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (Exception e) {
            // 生成失败不能抛到登录流程：调用方会降级成"不做挑战"
            throw new IllegalStateException("拼图素材生成失败", e);
        }
    }

    /**
     * 一组拼图素材。
     *
     * @param bgImage    背景图（data URI）
     * @param pieceImage 拼图块（data URI）
     * @param targetX    缺口横坐标 —— <b>只入服务端票据，绝不下发前端</b>
     * @param targetY    缺口纵坐标（下发，前端据此摆放块的纵向位置）
     * @param pieceSize  块边长（前端按此设置 CSS 尺寸，避免缩放导致坐标换算偏差）
     * @param bgWidth    背景宽度
     * @param bgHeight   背景高度
     */
    public record Puzzle(String bgImage, String pieceImage, int targetX, int targetY,
                         int pieceSize, int bgWidth, int bgHeight) {
    }
}
