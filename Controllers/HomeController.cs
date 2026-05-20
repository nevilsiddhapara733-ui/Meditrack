using Microsoft.AspNetCore.Mvc;

namespace MediTrack.Controllers;

public class HomeController : Controller
{
    // Serve the single-page app shell for all non-API routes
    public IActionResult Index() => View();
}
