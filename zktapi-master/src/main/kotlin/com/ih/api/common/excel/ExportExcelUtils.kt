package com.ih.api.common.excel

import javafx.scene.control.Cell
import com.sun.rowset.internal.Row
import javafx.scene.layout.BorderStroke.THIN
import javax.swing.SpringLayout.VERTICAL_CENTER
import javax.swing.text.StyleConstants.setBold
import com.sun.xml.internal.ws.streaming.XMLStreamWriterUtil.getOutputStream
import java.io.OutputStream
import java.net.URLEncoder
import javax.servlet.http.HttpServletResponse
import org.apache.poi.*
import org.apache.poi.hssf.usermodel.HSSFCellStyle
import org.apache.poi.hssf.usermodel.HSSFSheet
import org.apache.poi.hssf.usermodel.HSSFWorkbook
import org.apache.poi.hssf.util.HSSFColor
import org.apache.poi.sl.usermodel.Sheet
import org.apache.poi.ss.usermodel.*


object ExportExcelUtils {
    @Throws(Exception::class)
    fun exportExcel(response: HttpServletResponse, fileName: String, data: ExcelData) {
        // 告诉浏览器用什么软件可以打开此文件
        response.setHeader("content-Type", "application/vnd.ms-excel")
        // 下载文件的默认名称
        response.setHeader("Content-Disposition", "attachment;filename=" + URLEncoder.encode(fileName, "utf-8"))
        exportExcel(data, response.outputStream)
    }

    @Throws(Exception::class)
    fun exportExcel(data: ExcelData, out: OutputStream) {

        val wb = HSSFWorkbook()
        try {
            var sheetName = data.getName()
            if (null == sheetName) {
                sheetName = "Sheet1"
            }
            val sheet = wb.createSheet(sheetName)
            writeExcel(wb, sheet, data)

            wb.write(out)
        } finally {
            wb.close()
        }
    }

    private fun writeExcel(wb: HSSFWorkbook, sheet: HSSFSheet, data: ExcelData) {

        var rowIndex   = writeTitlesToExcel(wb, sheet, data.getTitles()!!)
        writeRowsToExcel(wb, sheet, data.getRows()!!, rowIndex)
        autoSizeColumns(sheet, data.getTitles()!!.size + 1)

    }

    private fun writeTitlesToExcel(wb: HSSFWorkbook, sheet: HSSFSheet, titles: List<String>): Int {
        var rowIndex = 0
        var colIndex = 0

        val titleFont = wb.createFont()
        titleFont.setFontName("simsun")
        titleFont.setBold(true)
        // titleFont.setFontHeightInPoints((short) 14);
        titleFont.setColor(IndexedColors.BLACK.index)

        val titleStyle = wb.createCellStyle()
        titleStyle.setAlignment(HorizontalAlignment.CENTER)
        titleStyle.setVerticalAlignment(VerticalAlignment.CENTER)
        //titleStyle.setFillForegroundColor(HSSFColor(Color(182, 184, 192)))
        titleStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND)
        titleStyle.setFont(titleFont)
        setBorder(titleStyle, BorderStyle.THIN, HSSFColor())

        val titleRow = sheet.createRow(rowIndex)
        // titleRow.setHeightInPoints(25);
       // colIndex = 0

        for (field in titles) {
            val cell = titleRow.createCell(colIndex)
            cell.setCellValue(field)
            cell.setCellStyle(titleStyle)
            colIndex++
        }

        rowIndex++
        return rowIndex
    }

    private fun writeRowsToExcel(wb: HSSFWorkbook, sheet: HSSFSheet, rows: List<List<Any>>, rowIndex: Int): Int {
        var rowIndex = rowIndex
        var colIndex = 0

        val dataFont = wb.createFont()
        dataFont.setFontName("simsun")
        // dataFont.setFontHeightInPoints((short) 14);
        dataFont.setColor(IndexedColors.BLACK.index)

        val dataStyle = wb.createCellStyle()
        dataStyle.setAlignment(HorizontalAlignment.CENTER)
        dataStyle.setVerticalAlignment(VerticalAlignment.CENTER)
        dataStyle.setFont(dataFont)
        setBorder(dataStyle, BorderStyle.THIN, HSSFColor())

        for (rowData in rows) {
            val dataRow = sheet.createRow(rowIndex)
            // dataRow.setHeightInPoints(25);
            colIndex = 0

            for (cellData in rowData) {
                val cell = dataRow.createCell(colIndex)
                //if (cellData != null) {
                    cell.setCellValue(cellData.toString())
               // } else {
                //    cell.setCellValue("")
               // }

                cell.setCellStyle(dataStyle)
                colIndex++
            }
            rowIndex++
        }
        return rowIndex
    }

    private fun autoSizeColumns(sheet:HSSFSheet, columnNumber: Int) {

        for (i in 0 until columnNumber) {
            val orgWidth = sheet.getColumnWidth(i)
            sheet.autoSizeColumn(i, true)
            val newWidth = (sheet.getColumnWidth(i) + 100) as Int
            if (newWidth > orgWidth) {
                sheet.setColumnWidth(i, newWidth)
            } else {
                sheet.setColumnWidth(i, orgWidth)
            }
        }
    }

    private fun setBorder(style:HSSFCellStyle, border: BorderStyle, color: HSSFColor) {
        style.setBorderTop(border)
        style.setBorderLeft(border)
        style.setBorderRight(border)
        style.setBorderBottom(border)
        style.setTopBorderColor(0)
        style.setBottomBorderColor(0)
        style.setLeftBorderColor(0)
        style.setRightBorderColor(0)
    }
}