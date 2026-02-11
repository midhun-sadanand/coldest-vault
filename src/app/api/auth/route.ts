import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    
    const sitePassword = process.env.SITE_PASSWORD;
    
    if (!sitePassword) {
      console.error('SITE_PASSWORD environment variable not set');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (password === sitePassword) {
      const response = NextResponse.json({ success: true });
      
      // Set HTTP-only cookie that expires in 7 days
      response.cookies.set('vault-auth', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
      
      return response;
    }

    return NextResponse.json(
      { error: 'Invalid password' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}

// GET endpoint to check auth status
export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  const isAuthenticated = cookieHeader?.includes('vault-auth=authenticated');
  
  return NextResponse.json({ authenticated: isAuthenticated });
}
