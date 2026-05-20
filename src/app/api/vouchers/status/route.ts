
import { NextRequest, NextResponse } from 'next/server';
import { checkVoucherStatusAction } from '@/app/actions/vouchers';

/**
 * API para consultar el estado integral de un vale.
 * GET /api/vouchers/status?id=VALE_ID&fecha=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const fecha = searchParams.get('fecha');

    if (!id || !fecha) {
      return NextResponse.json(
        { error: 'Se requieren los parámetros "id" y "fecha" (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const voucher = await checkVoucherStatusAction(id, fecha);

    if (!voucher) {
      return NextResponse.json(
        { 
          id, 
          exists: false, 
          status: 'pending_capture',
          message: 'El vale aún no ha sido registrado en el sistema local.' 
        },
        { status: 404 }
      );
    }

    // Calculamos estados lógicos para facilitar la lectura externa
    const response = {
      id: voucher.id,
      exists: true,
      lastUpdated: voucher.timestamp,
      workflow: {
        isSigned: voucher.firmado || !!voucher.motivoOmitido,
        hasSignatureImage: !!voucher.firmaUrl,
        isOmitted: !!voucher.motivoOmitido,
        hasReceipt: !!voucher.comprobanteUrl,
        isArchivedPdf: !!voucher.hasPdf
      },
      details: {
        numVale: voucher.numVale,
        entregado: voucher.entregado,
        monto: voucher.monto,
        sucursal: voucher.sucursal,
        sheet: voucher.sheet,
        fila: voucher.fila
      },
      // Devolvemos el registro completo por si se requiere comparar data
      raw: voucher
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
