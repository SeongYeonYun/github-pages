package controller;

import java.io.IOException;

import javax.servlet.RequestDispatcher;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * Servlet implementation class soapCtrl
 */
@WebServlet("/soap")
public class soapCtrl extends HttpServlet {
	private static final long serialVersionUID = 1L;
       
    public soapCtrl() {
        super();
    }


	protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		
		System.out.println("get");
//		response.sendRedirect(request.getContextPath() + "/html/soap_game_index.html");
		response.sendRedirect(request.getContextPath() + "/html/game_main.html");
		
//		String ip = request.getRemoteAddr();

	}


	protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		
		
		RequestDispatcher rd = request.getRequestDispatcher("/html/game_main.html");
		rd.forward(request, response);

		
		
		
		
		String ip = request.getRemoteAddr();
		System.out.println("������ Ŭ���̾�Ʈ IP: " + ip);
		
	}

}
