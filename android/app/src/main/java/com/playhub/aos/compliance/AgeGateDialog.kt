package com.playhub.aos.compliance

import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import java.util.Calendar
import java.util.Locale

/**
 * Neutral Age Gate dialog complying with Google Play Families / COPPA / KR PIPA:
 * - No pre-filled birth date default (user must explicitly choose year and month).
 * - High-contrast dark theme spinner cells so labels remain crisp on all Android OEMs (OneUI/Pixel).
 */
object AgeGateDialog {
    fun show(
        context: Context,
        onConfirmed: (birthYear: Int, birthMonth: Int, tier: AgeTier, regionCode: String) -> Unit
    ) {
        val cal = Calendar.getInstance()
        val nowYear = cal.get(Calendar.YEAR)
        val nowMonth = cal.get(Calendar.MONTH) + 1
        val regionCode = Locale.getDefault().country.ifBlank { "KR" }
        val dp = context.resources.displayMetrics.density
        fun px(v: Int): Int = (v * dp).toInt()

        val years = mutableListOf("출생연도 선택")
        for (y in nowYear downTo (nowYear - 100)) years.add("${y}년")

        val months = mutableListOf("출생월 선택")
        for (m in 1..12) months.add("${m}월")

        fun createHighContrastAdapter(items: List<String>): ArrayAdapter<String> =
            object : ArrayAdapter<String>(context, android.R.layout.simple_spinner_item, items) {
                override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
                    val tv = (convertView as? TextView) ?: TextView(context)
                    tv.text = items[position]
                    tv.textSize = 15f
                    tv.setTextColor(if (position == 0) Color.parseColor("#94A3B8") else Color.WHITE)
                    tv.typeface = if (position == 0) Typeface.DEFAULT else Typeface.DEFAULT_BOLD
                    tv.setPadding(px(14), px(12), px(36), px(12))
                    tv.gravity = Gravity.CENTER_VERTICAL
                    return tv
                }

                override fun getDropDownView(position: Int, convertView: View?, parent: ViewGroup): View {
                    val tv = (convertView as? TextView) ?: TextView(context)
                    tv.text = items[position]
                    tv.textSize = 15f
                    tv.setTextColor(if (position == 0) Color.parseColor("#94A3B8") else Color.WHITE)
                    tv.setBackgroundColor(Color.parseColor("#1E293B"))
                    tv.setPadding(px(16), px(13), px(16), px(13))
                    return tv
                }
            }

        fun spinnerBg() = GradientDrawable().apply {
            setColor(Color.parseColor("#1E293B"))
            cornerRadius = px(12).toFloat()
            setStroke(px(1), Color.parseColor("#334155"))
        }

        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#111827"))
            setPadding(px(22), px(20), px(22), px(12))
        }

        val title = TextView(context).apply {
            text = "연령 확인 (Age Gate)"
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
        }
        val info = TextView(context).apply {
            text = "안전한 게임 등급과 소셜 보호를 위해 출생연월을 확인합니다.\n확인 후 로그인 없이 Guest로 바로 플레이할 수 있습니다."
            textSize = 13f
            setTextColor(Color.parseColor("#CBD5E1"))
            setPadding(0, px(8), 0, px(16))
        }

        val yearLabel = TextView(context).apply {
            text = "출생연도"
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#94A3B8"))
            setPadding(0, 0, 0, px(4))
        }
        val yearSpinner = Spinner(context, Spinner.MODE_DIALOG).apply {
            adapter = createHighContrastAdapter(years)
            background = spinnerBg()
            prompt = "출생연도를 선택하세요"
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = px(12) }
        }

        val monthLabel = TextView(context).apply {
            text = "출생월"
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#94A3B8"))
            setPadding(0, 0, 0, px(4))
        }
        val monthSpinner = Spinner(context, Spinner.MODE_DIALOG).apply {
            adapter = createHighContrastAdapter(months)
            background = spinnerBg()
            prompt = "출생월을 선택하세요"
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = px(8) }
        }

        val errorText = TextView(context).apply {
            text = ""
            textSize = 12f
            setTextColor(Color.parseColor("#F87171"))
            setPadding(0, px(4), 0, px(8))
        }

        val confirmBtn = TextView(context).apply {
            text = "확인하고 Guest로 시작"
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            setPadding(px(16), px(13), px(16), px(13))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#16A34A"))
                cornerRadius = px(12).toFloat()
            }
        }

        container.addView(title)
        container.addView(info)
        container.addView(yearLabel)
        container.addView(yearSpinner)
        container.addView(monthLabel)
        container.addView(monthSpinner)
        container.addView(errorText)
        container.addView(confirmBtn)

        val dialog = AlertDialog.Builder(context, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setView(container)
            .setCancelable(false)
            .create()

        confirmBtn.setOnClickListener {
            val yIdx = yearSpinner.selectedItemPosition
            val mIdx = monthSpinner.selectedItemPosition
            if (yIdx == 0 || mIdx == 0) {
                errorText.text = "출생연도와 출생월을 모두 선택해 주세요."
                return@setOnClickListener
            }
            val birthYear = nowYear - (yIdx - 1)
            val birthMonth = mIdx
            val tier = AgeGatePolicy.classify(birthYear, birthMonth, nowYear, nowMonth, regionCode)
            if (tier == AgeTier.UNKNOWN) {
                errorText.text = "올바른 출생연월을 선택해 주세요."
                return@setOnClickListener
            }
            dialog.dismiss()
            onConfirmed(birthYear, birthMonth, tier, regionCode)
        }

        dialog.window?.setBackgroundDrawable(GradientDrawable().apply {
            setColor(Color.parseColor("#111827"))
            cornerRadius = px(16).toFloat()
        })
        dialog.show()
    }
}
