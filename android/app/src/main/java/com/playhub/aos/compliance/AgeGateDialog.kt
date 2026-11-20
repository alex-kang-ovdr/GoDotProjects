package com.playhub.aos.compliance

import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import java.util.Calendar
import java.util.Locale

/**
 * Neutral Age Gate dialog complying with Google Play Families / COPPA / KR PIPA:
 * - No pre-filled birth date default (user must explicitly choose year and month).
 * - Does not ask leading yes/no questions ("Are you 14+?").
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

        val years = mutableListOf("출생연도 선택")
        for (y in nowYear downTo (nowYear - 100)) years.add(y.toString())

        val months = mutableListOf("출생월 선택")
        for (m in 1..12) months.add("${m}월")

        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 32, 48, 16)
        }

        val info = TextView(context).apply {
            text = "연령에 맞는 안전한 게임과 소셜 환경을 제공하기 위해 출생연월을 확인합니다.\nGuest로 바로 플레이할 수 있습니다."
            textSize = 14f
            setTextColor(Color.parseColor("#E5E7EB"))
        }
        val errorText = TextView(context).apply {
            text = ""
            textSize = 12f
            setTextColor(Color.parseColor("#F87171"))
            setPadding(0, 12, 0, 0)
        }

        val yearSpinner = Spinner(context).apply {
            adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, years)
        }
        val monthSpinner = Spinner(context).apply {
            adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, months)
        }

        container.addView(info)
        container.addView(yearSpinner)
        container.addView(monthSpinner)
        container.addView(errorText)

        val dialog = AlertDialog.Builder(context, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("연령 확인 (Age Gate)")
            .setView(container)
            .setCancelable(false)
            .setPositiveButton("확인하고 시작", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val yIdx = yearSpinner.selectedItemPosition
                val mIdx = monthSpinner.selectedItemPosition
                if (yIdx == 0 || mIdx == 0) {
                    errorText.text = "출생연도와 출생월을 모두 선택해 주세요."
                    return@setOnClickListener
                }
                val birthYear = years[yIdx].toInt()
                val birthMonth = mIdx
                val tier = AgeGatePolicy.classify(birthYear, birthMonth, nowYear, nowMonth, regionCode)
                if (tier == AgeTier.UNKNOWN) {
                    errorText.text = "올바른 출생연월을 선택해 주세요."
                    return@setOnClickListener
                }
                dialog.dismiss()
                onConfirmed(birthYear, birthMonth, tier, regionCode)
            }
        }
        dialog.show()
    }
}
