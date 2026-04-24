import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { error: 'This endpoint has moved. Use /api/search for people, meetups, and venues.' },
    { status: 410 }
  )
}
