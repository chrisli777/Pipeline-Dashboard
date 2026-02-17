import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { fetchAndComputeProjections } from '@/lib/replenishment-data'
import {
  buildRiskReport,
  generateEmailHtml,
  generateEmailSubject,
} from '@/lib/risk-report-generator'

/**
 * Weekly Risk Report API
 *
 * Triggered by:
 * - Vercel Cron (GET, Saturday 8am EST)
 * - Manual POST request
 *
 * Flow:
 * 1. Fetch + compute all projections (shared data layer)
 * 2. Build risk report
 * 3. Generate AI summary (optional, if ANTHROPIC_API_KEY set)
 * 4. Generate email HTML
 * 5. Send via Gmail SMTP (if SMTP_USER/SMTP_PASS set)
 */

// Verify cron secret for GET requests
function verifyCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true // no secret = no protection (dev mode)
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

// AI Summary Generation (non-streaming)
async function generateAISummary(
  reportData: { criticalItems: unknown[]; warningItems: unknown[]; reportWeekLabel: string }
): Promise<{ summary: string; actionItems: string; meetingAgenda: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const riskDataStr = JSON.stringify({
      reportWeek: reportData.reportWeekLabel,
      criticalItems: reportData.criticalItems,
      warningItems: reportData.warningItems,
    }, null, 2)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: `You are a senior supply chain risk analyst for WHI International. Analyze this weekly risk data and provide:

1. EXECUTIVE SUMMARY (2-3 sentences): Key risks and overall supply health status.
2. ACTION ITEMS (bullet list): Specific actions the team should take this week.
3. MEETING AGENDA (3-5 items): Suggested topics for the weekly customer meeting with Genie.

Risk Data:
${riskDataStr}

Respond in this exact JSON format:
{"summary":"...","actionItems":"...","meetingAgenda":"..."}

Keep it concise and actionable. Use HTML for formatting (bullet lists: <ul><li>).`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30000), // 30s timeout
    })

    if (!response.ok) return null

    const data = await response.json()
    const rawText = data.content?.[0]?.text || ''

    // Extract JSON
    let jsonStr = rawText
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) jsonStr = jsonMatch[0]

    const parsed = JSON.parse(jsonStr)
    return {
      summary: parsed.summary || null,
      actionItems: parsed.actionItems || null,
      meetingAgenda: parsed.meetingAgenda || null,
    }
  } catch (err) {
    console.error('AI summary generation failed:', err)
    return null
  }
}

// Send email via Gmail SMTP
async function sendEmail(
  subject: string,
  html: string,
  recipients: string[]
): Promise<boolean> {
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS

  if (!smtpUser || !smtpPass) {
    console.log('SMTP credentials not configured, skipping email send')
    return false
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // TLS
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    await transporter.sendMail({
      from: `"WHI Pipeline" <${smtpUser}>`,
      to: recipients.join(', '),
      subject,
      html,
    })

    return true
  } catch (err) {
    console.error('Email send failed:', err)
    return false
  }
}

async function handleReport(request: Request) {
  try {
    // 1. Fetch and compute projections
    const { currentWeek, projections, suggestions, summary } = await fetchAndComputeProjections()

    // 2. Build initial risk report (without AI)
    let report = buildRiskReport(projections, suggestions, summary, currentWeek)

    // 3. Generate AI summary (optional)
    const aiResult = await generateAISummary(report)
    if (aiResult) {
      report = buildRiskReport(
        projections, suggestions, summary, currentWeek,
        aiResult.summary, aiResult.actionItems, aiResult.meetingAgenda
      )
    }

    // 4. Generate email
    const subject = generateEmailSubject(report)
    const html = generateEmailHtml(report)

    // 5. Send email
    const recipients = (process.env.REPORT_RECIPIENTS || 'richard.fan@whcast.com')
      .split(',')
      .map(e => e.trim())
      .filter(Boolean)

    const emailSent = await sendEmail(subject, html, recipients)

    return NextResponse.json({
      success: true,
      reportWeek: report.reportWeekLabel,
      criticalCount: report.criticalCount,
      warningCount: report.warningCount,
      okCount: report.okCount,
      totalSkus: report.totalSkus,
      unmitigatedRiskCount: report.unmitigatedRiskCount,
      aiSummaryGenerated: !!aiResult,
      emailSent,
      recipients: emailSent ? recipients : [],
      generatedAt: report.generatedAt,
    })
  } catch (error) {
    console.error('Weekly risk report error:', error)
    return NextResponse.json(
      { error: 'Failed to generate risk report', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET: Vercel Cron trigger
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return handleReport(request)
}

// POST: Manual trigger
export async function POST(request: Request) {
  return handleReport(request)
}
