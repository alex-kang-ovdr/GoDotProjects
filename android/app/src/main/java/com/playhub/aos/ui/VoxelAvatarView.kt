package com.playhub.aos.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs

data class AvatarCosmeticItem(
    val id: String,
    val name: String,
    val category: String,      // hat, face, top, back
    val categoryLabel: String, // 모자, 얼굴, 상의, 등 장식
    val owned: Boolean,
    val price: Int,
    val accentHex: String
)

object AvatarCatalog {
    val CATEGORIES = listOf(
        "all" to "전체",
        "hat" to "모자",
        "face" to "얼굴",
        "top" to "상의",
        "back" to "등 장식"
    )

    val ITEMS = listOf(
        AvatarCosmeticItem("i1", "에메랄드 테크 후디", "top", "상의", owned = true, price = 0, accentHex = "#4ADE80"),
        AvatarCosmeticItem("i2", "사이버 시안 바이저", "face", "얼굴", owned = true, price = 0, accentHex = "#72DCFF"),
        AvatarCosmeticItem("i3", "네온 스트릿 캡", "hat", "모자", owned = true, price = 0, accentHex = "#00E290"),
        AvatarCosmeticItem("i4", "홀로그램 사이버 윙", "back", "등 장식", owned = false, price = 450, accentHex = "#64FCC9"),
        AvatarCosmeticItem("i5", "미드나잇 스트릿 재킷", "top", "상의", owned = true, price = 0, accentHex = "#60A5FA"),
        AvatarCosmeticItem("i6", "골드 챔피언 크라운", "hat", "모자", owned = false, price = 300, accentHex = "#FFD147")
    )

    val DEFAULT_EQUIPPED = setOf("i1", "i2")
}

/**
 * Interactive 3D-style Voxel Avatar Studio Preview View (zero external image bloat).
 * Reflects equipped wardrobe items live and supports horizontal drag-to-rotate (360° preview).
 */
class VoxelAvatarView(
    context: Context,
    private val portraitMode: Boolean = false
) : View(context) {

    var equippedIds: Set<String> = AvatarCatalog.DEFAULT_EQUIPPED
        set(value) {
            field = value
            invalidate()
        }

    var accentColorHex: String = "#00B06F"
        set(value) {
            field = value
            invalidate()
        }

    private var yawOffset: Float = 0f // -1.0f .. 1.0f
    private var lastTouchX: Float = 0f

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val heightMode = MeasureSpec.getMode(heightMeasureSpec)
        val heightSize = MeasureSpec.getSize(heightMeasureSpec)
        val desiredHeight = when {
            heightMode == MeasureSpec.EXACTLY && heightSize > 0 -> heightSize
            portraitMode -> width.coerceAtLeast(1)
            else -> ((width * 0.75f).toInt()).coerceAtLeast((resources.displayMetrics.density * 240f).toInt())
        }
        setMeasuredDimension(width, desiredHeight)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (portraitMode) return super.onTouchEvent(event)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastTouchX = event.x
                parent?.requestDisallowInterceptTouchEvent(true)
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = event.x - lastTouchX
                lastTouchX = event.x
                yawOffset = (yawOffset + dx / (width.coerceAtLeast(1) * 0.45f)).coerceIn(-1f, 1f)
                invalidate()
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                parent?.requestDisallowInterceptTouchEvent(false)
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val accent = runCatching { Color.parseColor(accentColorHex) }.getOrDefault(Color.parseColor("#00B06F"))

        // Studio backdrop
        fillPaint.shader = RadialGradient(
            w * 0.5f,
            h * (if (portraitMode) 0.45f else 0.42f),
            maxOf(w, h) * 0.72f,
            intArrayOf(Color.parseColor("#2B3136"), Color.parseColor("#181B1E"), Color.parseColor("#111315")),
            floatArrayOf(0f, 0.58f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawRect(0f, 0f, w, h, fillPaint)
        fillPaint.shader = null

        if (!portraitMode) {
            // Subtle floor glow disc
            fillPaint.shader = RadialGradient(
                w * 0.5f, h * 0.87f, w * 0.34f,
                intArrayOf(Color.argb(65, Color.red(accent), Color.green(accent), Color.blue(accent)), Color.TRANSPARENT),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            canvas.drawOval(RectF(w * 0.16f, h * 0.78f, w * 0.84f, h * 0.95f), fillPaint)
            fillPaint.shader = null
        }

        val scale = if (portraitMode) minOf(w, h) / 108f else minOf(w * 0.72f, h * 0.92f) / 180f
        val cx = w * 0.5f
        val baseY = if (portraitMode) h * 1.18f else h * 0.88f
        val shift = yawOffset * 8f * scale

        val hasHoodie = equippedIds.contains("i1")
        val hasMidnight = equippedIds.contains("i5") && !hasHoodie
        val hasVisor = equippedIds.contains("i2")
        val hasCap = equippedIds.contains("i3")
        val hasCrown = equippedIds.contains("i6") && !hasCap
        val hasWings = equippedIds.contains("i4")

        val topMain = when {
            hasHoodie -> Color.parseColor("#65E844")
            hasMidnight -> Color.parseColor("#2563EB")
            else -> accent
        }
        val topShade = when {
            hasHoodie -> Color.parseColor("#2EA826")
            hasMidnight -> Color.parseColor("#1D4ED8")
            else -> Color.parseColor("#142C25")
        }

        // 1. Back accessory: Hologram Cyber Wings (behind body)
        if (hasWings) {
            drawWings(canvas, cx, baseY - 88f * scale, scale, shift)
        }

        // 2. Legs & Sneakers (full body mode)
        if (!portraitMode) {
            val legW = 16f * scale
            val legH = 48f * scale
            val legTop = baseY - 56f * scale
            // Left & right legs
            drawVoxelBox(canvas, cx - 19f * scale + shift * 0.3f, legTop, legW, legH, Color.parseColor("#14171A"), Color.parseColor("#0B0D0F"), scale)
            drawVoxelBox(canvas, cx + 3f * scale + shift * 0.3f, legTop, legW, legH, Color.parseColor("#191D21"), Color.parseColor("#0E1012"), scale)
            // Sneakers with neon soles
            drawVoxelBox(canvas, cx - 21f * scale + shift * 0.3f, baseY - 11f * scale, 19f * scale, 10f * scale, Color.parseColor("#1B1F23"), topMain, scale)
            drawVoxelBox(canvas, cx + 2f * scale + shift * 0.3f, baseY - 11f * scale, 19f * scale, 10f * scale, Color.parseColor("#1B1F23"), topMain, scale)
        }

        // 3. Torso / Tech Hoodie or Jacket
        val torsoW = 46f * scale
        val torsoH = 54f * scale
        val torsoLeft = cx - torsoW / 2f + shift * 0.5f
        val torsoTop = baseY - 109f * scale
        drawVoxelBox(canvas, torsoLeft, torsoTop, torsoW, torsoH, topMain, topShade, scale)

        // Hoodie collar + zipper seam + pocket lines
        fillPaint.color = Color.parseColor("#111315")
        canvas.drawRect(cx - 1.5f * scale + shift * 0.7f, torsoTop, cx + 1.5f * scale + shift * 0.7f, torsoTop + torsoH, fillPaint)
        // Chest emblem (PlayHub Lime badge)
        fillPaint.color = Color.parseColor("#142C25")
        canvas.drawRoundRect(
            RectF(cx + 6f * scale + shift * 0.7f, torsoTop + 12f * scale, cx + 17f * scale + shift * 0.7f, torsoTop + 23f * scale),
            2f * scale, 2f * scale, fillPaint
        )
        fillPaint.color = Color.parseColor("#DEECA6")
        val tri = Path().apply {
            moveTo(cx + 9.5f * scale + shift * 0.7f, torsoTop + 14.5f * scale)
            lineTo(cx + 15f * scale + shift * 0.7f, torsoTop + 17.5f * scale)
            lineTo(cx + 9.5f * scale + shift * 0.7f, torsoTop + 20.5f * scale)
            close()
        }
        canvas.drawPath(tri, fillPaint)

        // Crossed arms (voxel style)
        drawVoxelBox(canvas, torsoLeft - 11f * scale, torsoTop + 4f * scale, 13f * scale, 36f * scale, topMain, topShade, scale)
        drawVoxelBox(canvas, torsoLeft + torsoW - 2f * scale, torsoTop + 4f * scale, 13f * scale, 36f * scale, topMain, topShade, scale)
        // Forearms bar across chest
        drawVoxelBox(canvas, torsoLeft - 4f * scale, torsoTop + 23f * scale, torsoW + 8f * scale, 12f * scale, topShade, Color.parseColor("#191B1D"), scale)

        // 4. Neck & Voxel Head
        val headSize = 36f * scale
        val headLeft = cx - headSize / 2f + shift
        val headTop = torsoTop - headSize - 2f * scale
        // Neck
        fillPaint.color = Color.parseColor("#C7916B")
        canvas.drawRect(cx - 7f * scale + shift * 0.8f, torsoTop - 5f * scale, cx + 7f * scale + shift * 0.8f, torsoTop + 2f * scale, fillPaint)
        // Head block
        drawVoxelBox(canvas, headLeft, headTop, headSize, headSize, Color.parseColor("#E3AE88"), Color.parseColor("#C7916B"), scale)
        // Hair block
        fillPaint.color = Color.parseColor("#1A1D21")
        canvas.drawRect(headLeft - 1f * scale, headTop - 3f * scale, headLeft + headSize + 1f * scale, headTop + 10f * scale, fillPaint)
        canvas.drawRect(headLeft - 2f * scale, headTop + 4f * scale, headLeft + 5f * scale, headTop + 18f * scale, fillPaint)
        canvas.drawRect(headLeft + headSize - 5f * scale, headTop + 4f * scale, headLeft + headSize + 2f * scale, headTop + 18f * scale, fillPaint)

        // Eyes & Smile
        val faceShift = shift * 0.45f
        if (hasVisor) {
            // Glowing Cyber Cyan Visor
            fillPaint.color = Color.parseColor("#0D3B4C")
            canvas.drawRoundRect(
                RectF(headLeft - 2f * scale + faceShift, headTop + 12f * scale, headLeft + headSize + 2f * scale + faceShift, headTop + 23f * scale),
                3f * scale, 3f * scale, fillPaint
            )
            fillPaint.shader = LinearGradient(
                headLeft, headTop + 12f * scale, headLeft + headSize, headTop + 22f * scale,
                intArrayOf(Color.parseColor("#22D3EE"), Color.parseColor("#A5F3FC"), Color.parseColor("#00E290")),
                null, Shader.TileMode.CLAMP
            )
            canvas.drawRoundRect(
                RectF(headLeft + 1f * scale + faceShift, headTop + 14f * scale, headLeft + headSize - 1f * scale + faceShift, headTop + 21f * scale),
                2f * scale, 2f * scale, fillPaint
            )
            fillPaint.shader = null
        } else {
            fillPaint.color = Color.parseColor("#14171A")
            canvas.drawRect(headLeft + 9f * scale + faceShift, headTop + 15f * scale, headLeft + 13f * scale + faceShift, headTop + 20f * scale, fillPaint)
            canvas.drawRect(headLeft + 23f * scale + faceShift, headTop + 15f * scale, headLeft + 27f * scale + faceShift, headTop + 20f * scale, fillPaint)
        }
        // Smile
        strokePaint.color = Color.parseColor("#6B4226")
        strokePaint.strokeWidth = 2f * scale
        canvas.drawLine(
            headLeft + 13f * scale + faceShift, headTop + 28f * scale,
            headLeft + 23f * scale + faceShift, headTop + 27.2f * scale,
            strokePaint
        )

        // 5. Hat slot: Neon Street Cap or Gold Crown
        if (hasCap) {
            drawVoxelBox(canvas, headLeft - 2f * scale, headTop - 11f * scale, headSize + 4f * scale, 13f * scale, Color.parseColor("#1D2228"), Color.parseColor("#00B06F"), scale)
            // Brim
            fillPaint.color = Color.parseColor("#00E290")
            canvas.drawRoundRect(
                RectF(headLeft - 4f * scale + faceShift * 0.5f, headTop - 1f * scale, headLeft + headSize + 10f * scale + faceShift * 0.5f, headTop + 4f * scale),
                2f * scale, 2f * scale, fillPaint
            )
        } else if (hasCrown) {
            val crownPath = Path().apply {
                val cl = headLeft + 3f * scale
                val cr = headLeft + headSize - 3f * scale
                val cb = headTop - 1f * scale
                val ct = headTop - 15f * scale
                moveTo(cl, cb)
                lineTo(cl, ct + 3f * scale)
                lineTo(cl + (cr - cl) * 0.25f, cb - 6f * scale)
                lineTo((cl + cr) / 2f, ct)
                lineTo(cl + (cr - cl) * 0.75f, cb - 6f * scale)
                lineTo(cr, ct + 3f * scale)
                lineTo(cr, cb)
                close()
            }
            fillPaint.color = Color.parseColor("#FFD147")
            canvas.drawPath(crownPath, fillPaint)
            strokePaint.color = Color.parseColor("#B45309")
            strokePaint.strokeWidth = 1.6f * scale
            canvas.drawPath(crownPath, strokePaint)
        }
    }

    private fun drawWings(canvas: Canvas, cx: Float, cy: Float, scale: Float, shift: Float) {
        val wingGlow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = Color.argb(120, 100, 252, 201)
        }
        val wingEdge = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 2.2f * scale
            color = Color.parseColor("#72DCFF")
        }
        val spread = 1f - abs(yawOffset) * 0.22f
        val leftWing = Path().apply {
            moveTo(cx - 18f * scale + shift * 0.4f, cy)
            lineTo(cx - (68f * spread) * scale + shift * 0.2f, cy - 28f * scale)
            lineTo(cx - (54f * spread) * scale + shift * 0.2f, cy + 16f * scale)
            lineTo(cx - 18f * scale + shift * 0.4f, cy + 20f * scale)
            close()
        }
        val rightWing = Path().apply {
            moveTo(cx + 18f * scale + shift * 0.4f, cy)
            lineTo(cx + (68f * spread) * scale + shift * 0.2f, cy - 28f * scale)
            lineTo(cx + (54f * spread) * scale + shift * 0.2f, cy + 16f * scale)
            lineTo(cx + 18f * scale + shift * 0.4f, cy + 20f * scale)
            close()
        }
        canvas.drawPath(leftWing, wingGlow)
        canvas.drawPath(rightWing, wingGlow)
        canvas.drawPath(leftWing, wingEdge)
        canvas.drawPath(rightWing, wingEdge)
    }

    private fun drawVoxelBox(
        canvas: Canvas,
        left: Float,
        top: Float,
        w: Float,
        h: Float,
        frontColor: Int,
        sideColor: Int,
        scale: Float
    ) {
        val depth = (3.5f + yawOffset * 2.5f) * scale
        // Side extrusion for 3D voxel depth
        fillPaint.color = sideColor
        if (depth >= 0) {
            canvas.drawRect(left + w - 1f, top + 2f * scale, left + w + depth, top + h, fillPaint)
        } else {
            canvas.drawRect(left + depth, top + 2f * scale, left + 1f, top + h, fillPaint)
        }
        // Main front face
        fillPaint.color = frontColor
        canvas.drawRoundRect(RectF(left, top, left + w, top + h), 2.5f * scale, 2.5f * scale, fillPaint)
        strokePaint.color = Color.argb(95, 0, 0, 0)
        strokePaint.strokeWidth = 1.2f * scale
        canvas.drawRoundRect(RectF(left, top, left + w, top + h), 2.5f * scale, 2.5f * scale, strokePaint)
    }
}

/**
 * Stylized vector-drawn wardrobe item thumbnail for the 2-column Avatar Studio grid.
 */
class AvatarItemThumbView(
    context: Context,
    private val item: AvatarCosmeticItem
) : View(context) {

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val accent = runCatching { Color.parseColor(item.accentHex) }.getOrDefault(Color.parseColor("#00B06F"))
        fillPaint.shader = RadialGradient(
            w * 0.5f, h * 0.45f, maxOf(w, h) * 0.65f,
            intArrayOf(Color.argb(65, Color.red(accent), Color.green(accent), Color.blue(accent)), Color.parseColor("#2B2E32")),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawRect(0f, 0f, w, h, fillPaint)
        fillPaint.shader = null

        val cx = w * 0.5f
        val cy = h * 0.52f
        val u = minOf(w, h) * 0.34f

        when (item.id) {
            "i1", "i5" -> {
                // Hoodie / Jacket icon
                fillPaint.color = accent
                canvas.drawRoundRect(RectF(cx - u * 0.85f, cy - u * 0.7f, cx + u * 0.85f, cy + u * 0.85f), u * 0.22f, u * 0.22f, fillPaint)
                canvas.drawRoundRect(RectF(cx - u * 1.15f, cy - u * 0.55f, cx - u * 0.6f, cy + u * 0.55f), u * 0.18f, u * 0.18f, fillPaint)
                canvas.drawRoundRect(RectF(cx + u * 0.6f, cy - u * 0.55f, cx + u * 1.15f, cy + u * 0.55f), u * 0.18f, u * 0.18f, fillPaint)
                fillPaint.color = Color.parseColor("#191B1D")
                canvas.drawRect(cx - u * 0.06f, cy - u * 0.65f, cx + u * 0.06f, cy + u * 0.85f, fillPaint)
                canvas.drawOval(RectF(cx - u * 0.35f, cy - u * 0.85f, cx + u * 0.35f, cy - u * 0.45f), fillPaint)
            }
            "i2" -> {
                // Cyber Visor icon
                fillPaint.color = Color.parseColor("#0D3B4C")
                canvas.drawRoundRect(RectF(cx - u * 1.15f, cy - u * 0.42f, cx + u * 1.15f, cy + u * 0.38f), u * 0.24f, u * 0.24f, fillPaint)
                fillPaint.color = accent
                canvas.drawRoundRect(RectF(cx - u * 0.96f, cy - u * 0.26f, cx + u * 0.96f, cy + u * 0.22f), u * 0.16f, u * 0.16f, fillPaint)
                strokePaint.color = Color.WHITE
                strokePaint.strokeWidth = u * 0.08f
                canvas.drawLine(cx - u * 0.6f, cy - u * 0.08f, cx - u * 0.1f, cy - u * 0.08f, strokePaint)
            }
            "i3" -> {
                // Neon Street Cap icon
                fillPaint.color = Color.parseColor("#1D2228")
                canvas.drawArc(RectF(cx - u * 0.95f, cy - u * 0.7f, cx + u * 0.95f, cy + u * 0.75f), 180f, 180f, true, fillPaint)
                fillPaint.color = accent
                canvas.drawRoundRect(RectF(cx - u * 1.0f, cy - u * 0.02f, cx + u * 1.25f, cy + u * 0.28f), u * 0.14f, u * 0.14f, fillPaint)
            }
            "i4" -> {
                // Hologram Cyber Wings icon
                fillPaint.color = Color.argb(175, Color.red(accent), Color.green(accent), Color.blue(accent))
                strokePaint.color = Color.parseColor("#72DCFF")
                strokePaint.strokeWidth = u * 0.08f
                val lw = Path().apply {
                    moveTo(cx - u * 0.12f, cy)
                    lineTo(cx - u * 1.2f, cy - u * 0.75f)
                    lineTo(cx - u * 0.85f, cy + u * 0.55f)
                    close()
                }
                val rw = Path().apply {
                    moveTo(cx + u * 0.12f, cy)
                    lineTo(cx + u * 1.2f, cy - u * 0.75f)
                    lineTo(cx + u * 0.85f, cy + u * 0.55f)
                    close()
                }
                canvas.drawPath(lw, fillPaint); canvas.drawPath(lw, strokePaint)
                canvas.drawPath(rw, fillPaint); canvas.drawPath(rw, strokePaint)
            }
            else -> {
                // Gold Crown icon
                val p = Path().apply {
                    moveTo(cx - u * 0.9f, cy + u * 0.45f)
                    lineTo(cx - u * 0.95f, cy - u * 0.45f)
                    lineTo(cx - u * 0.35f, cy)
                    lineTo(cx, cy - u * 0.68f)
                    lineTo(cx + u * 0.35f, cy)
                    lineTo(cx + u * 0.95f, cy - u * 0.45f)
                    lineTo(cx + u * 0.9f, cy + u * 0.45f)
                    close()
                }
                fillPaint.color = accent
                canvas.drawPath(p, fillPaint)
            }
        }
    }
}
